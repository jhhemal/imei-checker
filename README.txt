IMEI WEB APP - CONFIG VERSION

FILES
-----
index.html
styles.css
config.js
script.js
supabase-upgrade.sql

IMPORTANT
---------
1. Open config.js.
2. Enter your Supabase URL and Publishable Key ONE TIME.
3. Leave config.js alone when you replace script.js in future updates.
4. If you have not already run supabase-upgrade.sql for V2/V3, run it once in the Supabase SQL Editor.
5. Upload all website files to the same GitHub repository/folder.

Typical future updates:
- Replace index.html if needed
- Replace styles.css if needed
- Replace script.js if needed
- KEEP your existing config.js


SALES CSV IMEI CHECK
--------------------
The IMEI Match page now has "Check IMEIs From Sales CSV".

Choose a CSV file that contains a column named:
IMEI

Click "Load Sales CSV".

The IMEIs are added to the current verification list.
Any duplicates already in the list are skipped.

The uploaded sale_variations.csv contains 128 unique IMEIs.
