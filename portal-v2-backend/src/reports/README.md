# Private intervention reports

Feature is disabled unless both `PROJECT_REPORTS_ENABLED="true"` and a private
R2 binding `PROJECT_REPORTS` exist. This branch does not provision either resource.

PDF generation uses a narrow deterministic template shared with the browser.
The browser constructs the actual file. Worker preparation only wraps whitelisted
snapshot text into an A4 recipe. Upload verification assembles the server-owned
recipe and checks exact bytes by SHA-256 before R2 publication. No font shaping,
image decoding, font subsetting, HTML execution, Browser Rendering or external
conversion runs in a request. Fixed font/image resources are decoded at startup.

This deliberately avoids accepting arbitrary PDFs with a signed JSON payload:
that signature would not authenticate the PDF's content. `pdf-lib` alone cannot
provide this binding. A narrow serializer also avoids dynamic PDF metadata and
platform-dependent font subsetting. It must remain covered by extraction,
rendering, byte equality and access-control tests when edited.

The original PNG logo is encoded losslessly in a PDF image stream. DejaVu Sans
is embedded with its redistribution license and a ToUnicode map. Unsupported
characters fail closed. All legal details come from the current supplier module.

Snapshot/recipe JSON is temporary metadata for restart-safe verification, never
binary PDF data. It is cleared after successful publication or deletion. The
original completion snapshot is retained only until the first report is saved.
Permanent metadata consists of status/version/size/timestamps/digest and an
internal ledger of server-generated storage keys. Deleted-key tombstones allow
investigation/cleanup of a storage request interrupted between R2 and D1; they
contain no PDF and are never sent to a client.

Production activation still requires live R2 inspection, approved account setup,
Free-plan CPU profiling and a real Android smoke test. Local timing is not proof
of Cloudflare metered CPU. Do not update the production backend pin yet.
