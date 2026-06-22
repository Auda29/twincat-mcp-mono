# PLC Code Context

Task 22 adds a read-only PLC project-file context on top of the engineering
backend from tasks 20 and 21.

## Scope

- Reads configured `.plcproj` files from `engineering.projectFiles`.
- Follows referenced PLC object files such as `.TcPOU`, `.TcGVL`, `.TcDUT`, and
  `.TcIO`.
- Extracts compact object metadata, declaration text, implementation text, and
  source-file location.
- Lists library references from common PLC project reference elements such as
  placeholder and library references.
- Does not create, update, delete, move, or rewrite PLC project objects.

## Tools

- `plc_list_pous`: list PLC objects by project and optional object kind.
- `plc_read_pou`: read declaration and implementation text for one object.
- `plc_search_code`: search declarations and implementations with bounded
  result limits.
- `plc_describe_pou`: summarize kind, source path, and declaration or
  implementation previews.
- `plc_list_libraries`: list referenced PLC libraries.
- `plc_describe_library`: describe one referenced PLC library.

## Object Kinds

The file-backed prototype classifies common TwinCAT PLC objects as:

- `program`
- `functionBlock`
- `function`
- `gvl`
- `dut`
- `interface`
- `method`
- `action`
- `property`
- `unknown`

Classification is conservative and based on file extension, XML element names,
and common TwinCAT metadata such as `SpecialFunc`, `PouType`, or `Type`.

## Boundaries

The tools are intentionally read-only and separate from ADS runtime symbol
tools. Writable operations such as `plc_update_pou`, `plc_create_pou`, and
`plc_delete_pou` remain future work behind a separate safety model.
