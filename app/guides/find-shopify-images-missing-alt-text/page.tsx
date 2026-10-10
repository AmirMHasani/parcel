import GuidePage from '../../../components/GuidePage';
import {guideMetadata} from '../../../lib/seo';
const path='/guides/find-shopify-images-missing-alt-text';
export function generateMetadata(){return guideMetadata(path);}
export default function Page(){return <GuidePage path={path}>
  <p>Alt text matters twice: screen readers use it for accessibility, and search engines use it to understand your images. The problem is that Shopify buries alt text inside each product's media editor, one image at a time. There is no built-in view that shows every image and its alt text together, so auditing a whole catalog means clicking through products one by one. Here is how to get the full picture in a spreadsheet instead.</p>

  <h2>The free manual method</h2>
  <p>You can assemble the audit yourself from the product CSV plus some legwork.</p>
  <ol>
    <li>In Shopify admin, go to <strong>Products</strong>, click <strong>Export</strong>, and export your products as a CSV.</li>
    <li>Open the CSV and find the <strong>Image Src</strong> and <strong>Image Alt Text</strong> columns. The alt text column is populated only where someone actually wrote alt text, which is exactly what you are auditing.</li>
    <li>Filter or sort by the Image Alt Text column to find the blank rows. Those are your missing alt text.</li>
    <li>Fix each one in Shopify: open the product, open the image in the media editor, and add the alt text.</li>
    <li>Re-export the CSV and check the column again to verify nothing was missed.</li>
  </ol>
  <p>This works, but the CSV only tells you about alt text stored on the product record. It is a starting list, not a guarantee, so treat the re-export as your verification pass.</p>

  <h2>The faster way: Parcel</h2>
  <p>Parcel (parcelexport.com) turns the same product CSV into an audit-ready package. Upload the CSV and the manifest spreadsheet it returns lists every image with its link, SKU, and alt text in one place:</p>
  <ul>
    <li>Filter the alt text column for blanks to get your fix list in seconds</li>
    <li>Work through the list in Shopify, adding alt text where it is missing</li>
    <li>Re-run the export to confirm every image now has alt text</li>
  </ul>
  <p>One honest limitation: Parcel cannot write the fixes back into your store. It has no store access by design, which is what makes it safe to use, but it also means the fixing step happens in Shopify admin. Parcel's job is giving you the complete list from your CSV to work from, plus the verification pass at the end.</p>
  <p>Pricing is one-time, not a subscription. Up to 25 products is free, which covers the audit for a small catalog entirely. Larger catalogs are $9 (26 to 250 products), $19 (251 to 1,000), or $39 (over 1,000). Files are kept for 24 hours after your export is ready.</p>

  <h2>Run it before you need it</h2>
  <p>If the audit is part of a migration or a store closure, run the export while the products still exist. Once products are deleted, their image links stop working and the audit cannot be built.</p>
</GuidePage>;}
