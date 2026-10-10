import GuidePage from '../../../components/GuidePage';
import {guideMetadata} from '../../../lib/seo';
const path='/guides/migrate-shopify-to-woocommerce-images';
export function generateMetadata(){return guideMetadata(path);}
export default function Page(){return <GuidePage path={path}>
  <p>When you migrate platforms, product data transfers cleanly but images are the part people lose. Shopify's product CSV export gives you image links, not image files. WooCommerce's importer needs actual files, hosted somewhere your new store can reach. So the migration has a middle step: turn the links into files, organize them, and hand them to the WooCommerce import. Here is the free way to do that middle step, and a faster way.</p>

  <h2>The free manual method</h2>
  <p>This works and costs nothing. The tedious part is the organizing.</p>
  <ol>
    <li>In Shopify admin, go to <strong>Products</strong>, click <strong>Export</strong>, and export your products as a CSV. Do not delete anything yet.</li>
    <li>Open the CSV and find the <strong>Image Src</strong> column. Each cell is a direct link to one product image on Shopify's CDN.</li>
    <li>Copy the Image Src column into a bulk-download browser extension or a download script, and download every image. The files arrive with CDN-generated names, not product names.</li>
    <li>Sort the files into folders per product and rename them so you can match them to products later. For a large catalog this is the step that eats an afternoon.</li>
    <li>Upload the organized images to your new WooCommerce host (or any file host the importer can reach), then point each product's Images column in your WooCommerce import CSV at those locations.</li>
  </ol>
  <p>The risk in this method is silent loss. If a download fails and you do not notice, that product arrives on WooCommerce with no image, and you find out from a customer.</p>

  <h2>The faster way: Parcel</h2>
  <p>Parcel (parcelexport.com) does the middle step in one pass. Upload the same Shopify product CSV and get one ZIP file:</p>
  <ul>
    <li>One folder per product, so multi-image products stay together</li>
    <li>Files named by SKU (falls back to the product handle when a SKU is missing)</li>
    <li>A manifest spreadsheet listing every image with its link, SKU, and alt text, which doubles as your import checklist</li>
    <li>A failed-downloads report listing any image that could not be fetched, instead of failing silently</li>
  </ul>
  <p>Upload the folders to your new host, work from the manifest when building the WooCommerce import CSV, and every product lands with its images attached. Nothing is installed on your Shopify store and Parcel never asks for store access. Images are downloaded as originals with no resizing.</p>
  <p>Pricing is one-time, not a subscription. Up to 25 products is free. Larger catalogs are $9 (26 to 250 products), $19 (251 to 1,000), or $39 (over 1,000). Files are kept for 24 hours after your export is ready.</p>

  <h2>Do it before you close the old store</h2>
  <p>Run the export <strong>before</strong> deleting products or closing your Shopify store. Once a product is gone, its image links stop working, and no tool can recover the files from the CSV.</p>
</GuidePage>;}
