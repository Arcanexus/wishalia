# Images of the items

Each item can show an image: on the owner's lists, in the preview, and on the page the family opens.
The owner does nothing for most of them: when an item is added with a link, the worker takes **up to
four images from the page** and the item shows the first. The owner can then pick another one, send
their own photo, and frame it.

![The image of an item: the one shown, its frame, the page's images and sending one's own](images/app-item-image.png)

Images are optional: they need a place for the files, **a volume or an S3 bucket**, and imgproxy
(see [Set-up](#set-up)). Without them, Wishalia works the same, with no image.

## The « Image » page

Each item of a list has an **Image** button. Its page has, in this order:

- **The image shown**, as the family sees it, and « Ne plus afficher d'image ».
- **Recadrer**: a square frame over the image (the thumbnails are square). It moves four ways, for
  every hand: drag it, tap where it should be (one tap, no dragging needed, WCAG 2.5.7), the arrow
  keys (Shift for bigger steps, + and − for its size), or the « Taille du cadre » slider. « Garder
  l'image entière » removes the frame. Framing needs JavaScript; everything else on the page works
  without it.
- **Les images de la page**: the images found on the page of the link, and the owner's own, to
  choose from. While the worker is still reading the page, the page says so.
- **Envoyer votre image**: a photo from the phone (or the camera) or a picture from the computer.
  JPEG, PNG, WebP, GIF, AVIF or HEIC, 10 MB at most. A photo over 1.5 MB is made lighter on the
  device before it leaves (2 048 px on its longest side, JPEG): quicker on a weak connection, and the
  browser drops its EXIF data on the way. Sending a new image replaces the previous one sent.
  « Retirer votre image » erases it for good (the file too): the item goes back to the page's first
  image at once, and Wishalia reads the link again for fresh ones (without a link, the item has no
  image). « Ne plus afficher d'image » only hides it, to choose it again later.

Every change writes an `image_changed` entry to the item's history (owner only).

![A Christmas list on a phone, in dark mode, with the images of its items](images/app-list-christmas-dark.png)

## The page's images

When the worker reads the page of a link ([Enrichment](enrichment.md)), it also collects the links of
its images, best first: the product's own (`image` of the JSON-LD `Product`), the sharing image
(`og:image`, `twitter:image`, `image_src`), then the photos of the page (`<img>`, leaving out logos,
icons, sprites, SVG and anything declared under 120 px). It tries eight links at most and keeps four
images at most.

An Amazon page has neither and starts with banners and ads, so the worker reads Amazon's own
product photos instead: the photo shown big (`#landingImage`, or `#imgBlkFront` for a book) in its
largest size (`data-old-hires`, the biggest of `data-a-dynamic-image`), then the gallery (one link
per photo, its `hiRes` size); without a gallery, the product thumbnails of the page at 1500 px.
Only Amazon's product photos (`/images/I/`) are taken, never a banner, a logo, an ad or a video,
and never the same photo twice.

Each one is:

- fetched with **the same guard as the page** (public addresses only, checked after the DNS answer
  and at every redirect, standard ports, 10 seconds), and 10 MB at most;
- read again **from its bytes**: only a real JPEG, PNG, WebP, GIF, AVIF or HEIC is kept, never SVG
  (it can carry scripts) and never what the site's `Content-Type` claims;
- at least 120 px on each side when its size is known, and 50 megapixels at most;
- stored under a random key, on the volume or in the bucket.

The item shows the first one, unless the owner chose their own: a later run (a new link) replaces the
page's images, and keeps the owner's. When the images arrive, an `image_changed` entry is written to
the history. Items that already had a link when images came in are read once more, for their images
only (the owner's title and price stay).

## How the images are served

```
browser ──/img/<signature>/<options>/<source>.webp──▶ web-app / web-public ──▶ imgproxy ──▶ volume or bucket
```

- The API never gives a browser the place of a file. It gives **signed paths** (HMAC-SHA256 with
  `IMGPROXY_KEY` and `IMGPROXY_SALT`) for three sizes: `small` (192 px square), `medium` (480 px
  square), both framed, and `large` (1 200 px, whole, to frame it). A browser cannot ask for another
  file or another size: imgproxy refuses what the API did not sign, and the frontends refuse any path
  that does not look signed before asking imgproxy.
- The two frontends pass imgproxy's answer on under `/img/`, on their own host: the CSP keeps
  `img-src 'self'`, and imgproxy and the files stay inside the cluster. A path names a file that
  never changes, so the browsers keep it for a year.
- imgproxy only reads the image files (`local:///` under the volume, mounted read-only, or
  `s3://<bucket>/`), never a URL, at most 10 MB and 50 megapixels, turns photos the
  right way, and drops their metadata (EXIF, where a photo was taken) from what it sends.
- The images are WebP, which every browser of the last years reads.

The images say nothing about who gave what: the guests get the same signed paths as the owner, and
no image is ever a contribution data.

## Where the files live

| `images.storage`   | What it needs                                                                                                                                                 | Fits                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `volume` (default) | A PersistentVolumeClaim, created by the chart (`images.persistence.size`, `storageClass`) or yours (`images.persistence.existingClaim`). Nothing else to run. | A homelab, one node or a shared file system (NFS, Ceph). |
| `s3`               | An S3-compatible bucket (MinIO, Garage, a cloud bucket), its endpoint and its keys. Or Garage deployed by the chart (`images.garage.enabled`), see below.     | Several nodes, or a bucket you already back up.          |

On a volume, the API and the worker write the files and imgproxy mounts it read-only, at
`/data/images` in the three pods. A `ReadWriteOnce` volume (most storage classes) can only be
mounted on one node: the chart then keeps the API, the worker and imgproxy on the API's node (a
`podAffinity`, unless you set `affinity` yourself). With a `ReadWriteMany` volume they may run
anywhere. The claim the chart creates is kept on `helm uninstall`: the photos the family sent are not
lost with a release. A file is written beside its place and then renamed, so imgproxy never reads
half of one.

### A bucket deployed with the chart: Garage

Without an S3 service of your own, the chart can run [Garage](https://garagehq.deuxfleurs.fr) beside
Wishalia: `images.storage: s3`, `images.garage.enabled: true`, and `images.s3.endpoint` left empty
(the chart points it at Garage). MinIO is not offered: its community edition is no longer
maintained, with no new images or security fixes.

- One node (`garage server --single-node`, `replication_factor = 1`), as a StatefulSet with its
  volume (`images.garage.persistence`, 10 GiB, or your `existingClaim`), kept on `helm uninstall`.
  The volume is the copy to back up.
- Garage makes the bucket (`images.s3.bucket`) and its key at its first start, from
  `existingSecret`. The key must be in Garage's format:

  ```sh
  kubectl -n wishalia create secret generic wishalia-secrets \
    --from-literal=S3_ACCESS_KEY="GK$(openssl rand -hex 16)" \
    --from-literal=S3_SECRET_KEY="$(openssl rand -hex 32)" \
    --from-literal=GARAGE_RPC_SECRET="$(openssl rand -hex 32)" \
    --from-literal=IMGPROXY_KEY="$(openssl rand -hex 32)" \
    --from-literal=IMGPROXY_SALT="$(openssl rand -hex 32)" \
    --from-literal=AUTH_SECRET="$(openssl rand -base64 32)"
  ```

- Inside the cluster only: a NetworkPolicy lets in the API and the worker (which write) and imgproxy
  (which reads), on the S3 port. Its administration API has no token, so it only answers the
  probes (`/health`).

#### Its console: Garage UI

`images.garage.ui.enabled: true` adds [Garage UI](https://github.com/Noooste/garage-ui), a web
console for this Garage: browse and preview the images in the bucket, see its key and the node's
state. It is off by default.

- It needs Garage's administration token: `GARAGE_ADMIN_TOKEN` in `existingSecret`
  (`openssl rand -hex 32`). Garage then accepts administration with that token, from the console
  only (NetworkPolicy).
- **Sign-in**: with your OIDC provider (`images.garage.ui.oidc`, its client secret in
  `existingSecret` as `GARAGE_UI_OIDC_CLIENT_SECRET`, redirect URI
  `https://<images.garage.ui.host>/auth/oidc/callback`), or else the page asks for the admin token.
  With OIDC, garage-ui needs to know who may sign in, or it does not start: give it in
  `images.garage.ui.env`, the claim listing a person's groups and the groups allowed in. Everyone
  else is refused, even when the provider lets them through; those who get in may do everything.
  The chart asks for the scopes `openid`, `profile` and `email` (`images.garage.ui.oidc.scopes`):
  the groups claim must come with one of them, which `profile` does with Authentik.

  ```yaml
  images:
    garage:
      ui:
        env:
          GARAGE_UI_AUTH_OIDC_ROLE_ATTRIBUTE_PATH: groups
          GARAGE_UI_AUTH_OIDC_ADMIN_ROLES: garage-admins # comma-separated
  ```

- **Reaching it**: `images.garage.ui.host` gives it its own host on the ingress (the chart's
  `ingress.className` and `ingress.annotations`, TLS secret `images.garage.ui.tlsSecretName`).
  Without a host, it stays inside the cluster:
  `kubectl -n wishalia port-forward svc/<release>-wishalia-garage-ui 8080`.
- The console sees only the images, never any contribution. Deleting a file there removes it
  from the item that shows it.

Changing from one to the other does not move the files: the page images come back with the next
enrichment of each item, the photos the owner sent have to be copied over (same keys, `wishes/...`).

## Unused files

Now and then (every 6 hours by default) the worker looks over the volume or the bucket and removes
the files that no image names any more: a write cut halfway (the worker or the API stopped between
the file and its row), a removal that failed (the bucket was away when the owner changed their
photo), a file left half written on the volume. The images an item shows, the photos the owner sent
and the page's images they can still choose all have their row: they are never touched. A file
younger than a day is spared, so an upload being saved or a page being read is never hit.

| Setting                                     | Chart                          | Default |
| ------------------------------------------- | ------------------------------ | ------- |
| `IMAGE_CLEANUP_INTERVAL_HOURS` (`0`: never) | `images.cleanup.intervalHours` | `6`     |
| `IMAGE_CLEANUP_GRACE_HOURS` (1 at least)    | `images.cleanup.graceHours`    | `24`    |

The first sweep runs 5 minutes after the worker starts. It reads the files a thousand at a time (a
`ListObjectsV2` on S3: the bucket's key needs to list it, which Garage's and MinIO's bucket keys
can), with one query per thousand. Several workers may sweep at once: a removal is the same from
each. The worker logs what it removed, and [Monitoring](monitoring.md) counts it.

## Set-up

| Where              | What                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart              | `images.enabled: true`, then `images.persistence.*` for a volume, or `images.storage: s3` and `images.s3.endpoint` (and `region`, `bucket`), or `images.storage: s3` and `images.garage.enabled: true` for a bucket deployed with the chart. The chart deploys imgproxy, internal only. See [Chart values](chart-values.md). |
| `existingSecret`   | `IMGPROXY_KEY`, `IMGPROXY_SALT`: hex, 32 characters or more each (`openssl rand -hex 32`). With S3, also `S3_ACCESS_KEY`, `S3_SECRET_KEY`; with Garage, also `GARAGE_RPC_SECRET`, and the key in Garage's format (above).                                                                                                    |
| The bucket         | Created by the worker when it is missing, if its keys may. Only the API and the worker write in it; imgproxy reads it. Nothing in it is public.                                                                                                                                                                              |
| Without Kubernetes | Set the variables of [Configuration](configuration.md#images) on the API, the worker and the frontends (`IMGPROXY_URL`). `docker compose up` starts MinIO and imgproxy with local keys.                                                                                                                                      |

The API refuses to start when the image settings are only half set, and lists what is missing.
