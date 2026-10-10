import GuidePage from '../../../components/GuidePage';
import {guideMetadata} from '../../../lib/seo';
const path='/guides/export-shopify-images-by-sku';
export function generateMetadata(){return guideMetadata(path);}
export default function Page(){return <GuidePage path={path}>
  <p>File names matter when images leave Shopify. A warehouse system, a marketplace feed, or a designer receiving your catalog all work better with files named by SKU (TOTE-01-1.jpg) than with Shopify's CDN names (long strings of numbers and letters). Here is how to get SKU-named image files, the free way and the fast way.</p>

  <h2>The free manual method</h2>
  <p>Shopify's product CSV already contains everything you need: the <strong>Variant SKU</strong> column has your SKUs and the <strong>Image Src</strong> column has the image links. The work is joining the two.</p>
  <ol>
    <li>In Shopify admin, go to <strong>Products</strong>, click <strong>Export</strong>, and export your products as a CSV.</li>
    <li>Bulk-download the images from the Image Src column using a free browser extension or script. The files arrive with CDN-generated names.</li>
    <li>Build the mapping: match each downloaded file back to its product using the CSV, so you know which SKU each file belongs to. A spreadsheet VLOOKUP on the image URL gets you there.</li>
    <li>Rename every file to its SKU. A bulk-rename utility (or a short script) can apply the names from your spreadsheet in one pass.</li>
  </ol>
  <p>For a small catalog this is manageable. For hundreds of products with multiple images each, the matching and renaming is slow and error-prone: one misaligned row renames every file after it.</p>

  <h2>The faster way: Parcel</h2>
  <p>Parcel (parcelexport.com) does the whole thing in one step. Upload the same product CSV and you get one ZIP with:</p>
  <ul>
    <li>Files named by SKU automatically (products without a SKU fall back to the product handle)</li>
    <li>One folder per product, so multi-image products stay together</li>
    <li>A manifest spreadsheet listing every image with its link, SKU, and alt text</li>
    <li>A failed-downloads report for any image that could not be fetched</li>
  </ul>
  <p>Nothing is installed on your store and no store access is needed. Your CSV is parsed in your browser, and images are downloaded as originals with no resizing. Up to 25 products is free; larger exports are a one-time $9 (26 to 250 products), $19 (251 to 1,000), or $39 (over 1,000). No subscription. Files are kept for 24 hours after the export is ready.</p>

  <h2>One timing note</h2>
  <p>If you are renaming images as part of deleting products or closing a store, run the export first. Once products are deleted, the image links in the CSV stop working.</p>
</GuidePage>;}
