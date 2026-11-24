# Printing

Physical thermal printers require a secure local print bridge or supported network integration. A browser cannot silently print to arbitrary hardware. Printer records and persistent print jobs are stored in MySQL.

The development print ticket route creates a persistent job without claiming actual hardware success. 58 mm and 80 mm paper widths are configurable. Print retries, manual reprint and duplicate suppression require worker implementation before production hardware sign-off.
