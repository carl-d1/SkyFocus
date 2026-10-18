# Vendored files

Local copies at the same pinned versions the app used from CDNs, so SkyFocus works offline. The loaders try these first and fall back to the CDN, then to the built-in map, canvas globe or SVG charts.

| Folder | Version | Source | Licence |
|---|---|---|---|
| leaflet/1.9.4 | 1.9.4 | cdnjs | BSD 2-Clause (LICENSE) |
| three/0.149.0 | r149 | jsdelivr | MIT (LICENSE) |
| chart.js/4.4.1 | 4.4.1 | cdnjs | MIT (LICENSE.md) |
| three-globe/2.31.1 | 2.31.1 example images (NASA Blue Marble and Black Marble) | jsdelivr | MIT (LICENSE); imagery public domain (NASA) |
| fonts | Barlow, Barlow Condensed, IBM Plex Mono (latin and latin-ext) | Google Fonts | SIL Open Font License 1.1 |

Map tiles (Esri) are not vendored: they still need the internet, and the built-in map is used offline.
