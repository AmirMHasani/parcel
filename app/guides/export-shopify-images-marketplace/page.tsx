import GuidePage from '../../../components/GuidePage';
import {guideMetadata} from '../../../lib/seo';
const path='/guides/export-shopify-images-marketplace';
export function generateMetadata(){return guideMetadata(path);}
export default function Page(){return <GuidePage path={path}>
  <p>Marketplace listings need actual image files, not links. Amazon, Etsy, and eBay listing tools and feed templates match images to products by SKU or filename, so files named by SKU (TOTE-01-1.jpg) slot straight into a feed while Shopify's CDN names (long strings of numbers and letters) cause mismatches you have to fix by hand. The job is: get every product image out of Shopify as a real file, named by SKU. Here is the free way and the fast way.</p>

  <h2>The free manual method</h2>
  <p>Shopify's product CSV already has the two columns you need: <strong>Variant SKU</strong> for the names and <strong>Image Src</strong> for the image links. The work is joining them.</p>
  <ol>
    <li>In Shopify admin, go to <strong>Products</strong>, click <strong>Export</strong>, and export your products as a CSV.</li>
    <li>Bulk-download the images from the Image Src column with a free browser extension or a script. They arrive with CDN-generated names.</li>
    <li>Build the mapping: match each downloaded file to its product using the CSV, so you know which SKU each file belongs to. A spreadsheet VLOOKUP on the image URL gets you there.</li>
    <li>Rename every file to its SKU with a bulk-rename utility or a short script.</li>
    <li>Upload the renamed files to your marketplace listings or feed.</li>
  </ol>
  <p>For a small catalog this is manageable. For hundreds of products it is slow and error-prone: one misaligned row in the mapping renames every file after it, and a wrong image on a live Amazon listing is the kind of mistake customers screenshot.</p>

  <h2>The faster way: Parcel</h2>
  <p>Parcel (parcelexport.com) takes the same product CSV and returns one ZIP with the naming done:</p>
  <ul>
    <li>Files named by SKU automatically (products without a SKU fall back to the product handle)</li>
    <li>One folder per product, so multi-image products stay together</li>
    <li>A manifest spreadsheet listing every image with its link, SKU, and alt text, which you can cross-check against your marketplace feed</li>
    <li>A failed-downloads report for any image that could not be fetched</li>
  </ul>
  <p>Nothing is installed on your store and no store access is needed. Your CSV is parsed in your browser, and images are downloaded as originals with no resizing.</p>
  <p>Pricing is one-time, not a subscription. Up to 25 products is free. Larger exports are $9 (26 to 250 products), $19 (251 to 1,000), or $39 (over 1,000). Files are kept for 24 hours after your export is ready.</p>

  <h2>One timing note</h2>
  <p>If you are pulling images as part of closing products or leaving Shopify, run the export first. Once products are deleted, the image links in the CSV stop working and there is nothing left to download.</p>
</GuidePage>;}
