#!/usr/bin/env bash
# Descarga las fotos de public/img/photos/photos.txt (solo las que falten o cuyo id haya cambiado).
set -uo pipefail
DIR="$(cd "$(dirname "$0")/../public/img/photos" && pwd)"
while read -r file id _; do
  [[ -z "${file:-}" || "$file" == \#* ]] && continue
  stamp="$DIR/.$file.id"
  if [[ -s "$DIR/$file" && -f "$stamp" && "$(cat "$stamp")" == "$id" ]]; then continue; fi
  echo "Descargando $file ($id)…"
  if curl -fsSL --max-time 60 -o "$DIR/$file.tmp" "https://unsplash.com/photos/$id/download?force=true&w=1600"; then
    mv "$DIR/$file.tmp" "$DIR/$file" && echo "$id" > "$stamp"
  else
    rm -f "$DIR/$file.tmp"; echo "No se pudo descargar $file: la web mostrará un fondo en su lugar."
  fi
done < "$DIR/photos.txt"
