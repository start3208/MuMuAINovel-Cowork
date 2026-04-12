# MuMu Workspace Tools

`mumu_workspace.py` turns a MuMuAINovel export JSON file into a Claude Code friendly Markdown workspace and back again.

## Claude Code Workflow

1. Export a project JSON from MuMuAINovel.
2. Convert it into a Markdown workspace.
3. In Claude Code, use `ls` on section folders like `chapters`, `characters`, `foreshadows`.
4. Open `_index.md` inside a section to map short filenames to titles.
5. Edit the Markdown files only. Do not rename section folders or `_index.md`.
6. Run `validate`.
7. Convert the workspace back into JSON.
8. Import the round-tripped JSON back into MuMuAINovel.

## Commands

```powershell
python tools/mumu_workspace.py json-to-md "<export.json>"
python tools/mumu_workspace.py validate "workspace\<folder>"
python tools/mumu_workspace.py md-to-json "workspace\<folder>" "<roundtrip.json>"
python tools/mumu_workspace.py validate "<roundtrip.json>"
```

## Suggested Navigation

```powershell
ls workspace\project3-workspace
ls workspace\project3-workspace\chapters
Get-Content workspace\project3-workspace\chapters\_index.md
Get-Content workspace\project3-workspace\chapters\ch-001-*.md
```

## Editing Rules

- The generated workspace keeps each project section in its own Markdown file.
- Top-level foreshadows are also preserved and round-tripped.
- Record filenames now use short stable prefixes like `ch-001-...`, `char-001-...`, `fs-001-...` for easier `ls` navigation.
- Each section directory also includes an `_index.md` file that maps filenames to titles and key metadata.
- Each Markdown file includes TOML frontmatter plus explicit field markers so the import step can rebuild JSON safely.
- You can freely edit content inside Markdown files, including structured JSON blocks in fenced code sections.
- Do not rename section directories, `_index.md`, or top-level files like `project.md` unless you also plan to update the tool.
- Filenames may be renamed manually, but it is unnecessary because import is based on file contents, not the filename.
- `validate` works for both the original export JSON and the Markdown workspace.

## Recommended Pattern

- Use `project.md` for project-wide notes and world settings.
- Use `chapters/` for actual writing work.
- Use `characters/` and `foreshadows/` as reference material during drafting.
- Re-run `validate` before every `md-to-json`.
