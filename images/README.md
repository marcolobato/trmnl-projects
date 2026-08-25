# Images

Static images served straight to TRMNL devices via the Image plugin.

## How to use

1. Drop a `.png` here (800x480, monochrome or greyscale).
2. Commit and push to `main`.
3. Paste this URL into the TRMNL Image plugin, swapping in your filename:

   https://raw.githubusercontent.com/marcolobato/trmnl-projects/main/images/YOUR-FILE.png

## Naming

Use lowercase words separated by underscores, no spaces:
`lobato_boulder_flatiron_monochrome.png`

Spaces break URLs — they have to be escaped as `%20`, which is easy to get wrong.

## Replacing an image

GitHub caches raw files for about 5 minutes. If you replace a file and the device
still shows the old one, either wait it out or upload under a new filename
(e.g. `..._v2.png`) and update the plugin URL.
