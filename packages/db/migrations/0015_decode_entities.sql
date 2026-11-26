-- Wishes imported before 0.0.8 may hold HTML entities the importer did not know (« liste &agrave; jour »):
-- decoded once, with the table of @wishalia/domain (entities.ts), in titles, notes and list names.
CREATE FUNCTION pg_temp.wishalia_decode_entities(input text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  named constant jsonb := '{"quot":34,"amp":38,"apos":39,"lt":60,"gt":62,"nbsp":32,"iexcl":161,"cent":162,"pound":163,"curren":164,"yen":165,"brvbar":166,"sect":167,"uml":168,"copy":169,"ordf":170,"laquo":171,"not":172,"shy":173,"reg":174,"macr":175,"deg":176,"plusmn":177,"sup2":178,"sup3":179,"acute":180,"micro":181,"para":182,"middot":183,"cedil":184,"sup1":185,"ordm":186,"raquo":187,"frac14":188,"frac12":189,"frac34":190,"iquest":191,"Agrave":192,"Aacute":193,"Acirc":194,"Atilde":195,"Auml":196,"Aring":197,"AElig":198,"Ccedil":199,"Egrave":200,"Eacute":201,"Ecirc":202,"Euml":203,"Igrave":204,"Iacute":205,"Icirc":206,"Iuml":207,"ETH":208,"Ntilde":209,"Ograve":210,"Oacute":211,"Ocirc":212,"Otilde":213,"Ouml":214,"times":215,"Oslash":216,"Ugrave":217,"Uacute":218,"Ucirc":219,"Uuml":220,"Yacute":221,"THORN":222,"szlig":223,"agrave":224,"aacute":225,"acirc":226,"atilde":227,"auml":228,"aring":229,"aelig":230,"ccedil":231,"egrave":232,"eacute":233,"ecirc":234,"euml":235,"igrave":236,"iacute":237,"icirc":238,"iuml":239,"eth":240,"ntilde":241,"ograve":242,"oacute":243,"ocirc":244,"otilde":245,"ouml":246,"divide":247,"oslash":248,"ugrave":249,"uacute":250,"ucirc":251,"uuml":252,"yacute":253,"thorn":254,"yuml":255,"OElig":338,"oelig":339,"Scaron":352,"scaron":353,"Yuml":376,"fnof":402,"circ":710,"tilde":732,"ensp":8194,"emsp":8195,"thinsp":8201,"zwnj":8204,"zwj":8205,"lrm":8206,"rlm":8207,"ndash":8211,"mdash":8212,"lsquo":8216,"rsquo":8217,"sbquo":8218,"ldquo":8220,"rdquo":8221,"bdquo":8222,"dagger":8224,"Dagger":8225,"bull":8226,"hellip":8230,"permil":8240,"prime":8242,"Prime":8243,"lsaquo":8249,"rsaquo":8250,"oline":8254,"frasl":8260,"euro":8364,"trade":8482,"larr":8592,"uarr":8593,"rarr":8594,"darr":8595,"harr":8596,"minus":8722,"hearts":9829}';
  rest text := input;
  result text := '';
  found text[];
  whole text;
  code bigint;
  decoded text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  LOOP
    found := regexp_match(rest, '&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,7});');
    EXIT WHEN found IS NULL;
    whole := '&' || found[1] || ';';
    decoded := NULL;
    IF left(found[1], 1) = '#' THEN
      IF lower(substr(found[1], 2, 1)) = 'x' THEN
        code := (('x' || lpad(substr(found[1], 3), 8, '0'))::bit(32))::int;
      ELSE
        code := substr(found[1], 2)::bigint;
      END IF;
      IF code > 0 AND code <= 1114111 AND (code < 55296 OR code > 57343) THEN
        decoded := chr(code::int);
      END IF;
    ELSIF named ? found[1] THEN
      decoded := chr((named ->> found[1])::int);
    ELSIF lower(found[1]) IN ('quot', 'amp', 'apos', 'lt', 'gt') THEN
      decoded := chr((named ->> lower(found[1]))::int);
    END IF;
    result := result || left(rest, strpos(rest, whole) - 1) || coalesce(decoded, whole);
    rest := substr(rest, strpos(rest, whole) + length(whole));
  END LOOP;
  RETURN result || rest;
END
$$;--> statement-breakpoint
UPDATE "wishes" SET "title" = pg_temp.wishalia_decode_entities("title") WHERE "title" ~ '&[#A-Za-z0-9]+;';--> statement-breakpoint
UPDATE "wishes" SET "notes" = pg_temp.wishalia_decode_entities("notes") WHERE "notes" ~ '&[#A-Za-z0-9]+;';--> statement-breakpoint
UPDATE "wishes" SET "found_title" = pg_temp.wishalia_decode_entities("found_title") WHERE "found_title" ~ '&[#A-Za-z0-9]+;';--> statement-breakpoint
UPDATE "wish_lists" SET "name" = pg_temp.wishalia_decode_entities("name") WHERE "name" ~ '&[#A-Za-z0-9]+;';
