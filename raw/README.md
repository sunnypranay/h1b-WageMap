Place OFLC Wage Year 2026–27 export files here:

- `ALC_Export.csv`
- `Geography.csv`
- `oes_soc_occs.csv`
- `xwalk_plus.csv`

These CSVs are gitignored (they are large). Then run:

```bash
.venv/bin/python scripts/process_oflc_wages.py
```
