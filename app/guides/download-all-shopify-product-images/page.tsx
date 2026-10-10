import GuidePage from '../../../components/GuidePage';
import {guideMetadata} from '../../../lib/seo';
const path='/guides/download-all-shopify-product-images';
export function generateMetadata(){return guideMetadata(path);}
export default function Page(){return <GuidePage path={path}>
  <p>Shopify does not give you a "download all images" button. The images live on Shopify's CDN, and the way to reach them in bulk is through your product CSV. Below are the two realistic ways to do it: the free manual method, and a faster tool that does the organizing for you.</p>

  <h2>The free manual method</h2>
  <p>This costs nothing and works for any store. The catch is that you end up with unnamed files in a single folder, and you will spend time renaming and sorting them yourself.</p>
  <ol>
    <li>In Shopify admin, go to <strong>Products</strong>, click <strong>Export</strong>, and export your products as a CSV file.</li>
    <li>Open the CSV in a spreadsheet app. Find the <strong>Image Src</strong> column. Every cell in that column is a direct link to one product image on Shopify's CDN.</li>
    <li>Copy the Image Src column into a bulk-download browser extension (there are several free ones for Chrome and Firefox) or feed the URLs to a download script.</li>
    <li>Download. You get one folder of image files, named whatever the CDN called them (long strings of numbers and letters, not product names).</li>
  </ol>
  <p>If you have a handful of products, this is fine. If you have hundreds, the renaming and sorting is where the hours go.</p>

  <h2>The faster way: Parcel</h2>
  <p>Parcel (parcelexport.com) takes that same product CSV and returns one ZIP file, organized for you:</p>
  <ul>
    <li>One folder per product</li>
    <li>Files named by SKU (falls back to the product handle when a SKU is missing)</li>
    <li>A manifest spreadsheet listing every image with its link, SKU, and alt text</li>
    <li>A failed-downloads report if any image could not be fetched</li>
  </ul>
  <p>Nothing is installed on your store and Parcel never asks for store access. Your CSV is parsed in your browser, and the images are downloaded as originals: no resizing, no compression.</p>
  <p>Pricing is one-time, not a subscription. Up to 25 products is free. Larger exports are $9 (26 to 250 products), $19 (251 to 1,000), or $39 (over 1,000). Files are kept for 24 hours after your export is ready.</p>

  <h2>One thing to do first</h2>
  <p>Run the export <strong>before</strong> deleting products or closing your store. Once a product is gone, its image links stop working and there is nothing left to download.</p>
</GuidePage>;}
