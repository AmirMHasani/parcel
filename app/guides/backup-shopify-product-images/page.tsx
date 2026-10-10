import GuidePage from '../../../components/GuidePage';
import {guideMetadata} from '../../../lib/seo';
const path='/guides/backup-shopify-product-images';
export function generateMetadata(){return guideMetadata(path);}
export default function Page(){return <GuidePage path={path}>
  <p>If you are clearing out old products, migrating platforms, or closing a store, back up the product images first. This is the step people skip, and it is the one that cannot be undone: once a product is deleted or the store closes, its image links stop working. A CSV export of your products is not a backup of the images. The CSV only holds links. You need the actual files.</p>

  <h2>The free manual method</h2>
  <ol>
    <li>In Shopify admin, go to <strong>Products</strong>, click <strong>Export</strong>, and export your products as a CSV. This is the last time those image links will be valid, so do not delete anything yet.</li>
    <li>Open the CSV and find the <strong>Image Src</strong> column. Each cell is a direct link to one product image.</li>
    <li>Copy the Image Src column into a free bulk-download browser extension or a download script, and download every image.</li>
    <li>Rename and sort the files yourself. The downloads arrive with CDN-generated names, not product names, so set aside time for organizing them into folders.</li>
    <li>Store the finished backup somewhere safe: an external drive, cloud storage, or wherever your business keeps its files.</li>
  </ol>
  <p>This works, but it is easy to miss images. If a link fails silently during a bulk download, you may only find out months later when you need that file.</p>

  <h2>The faster way: Parcel</h2>
  <p>Parcel (parcelexport.com) takes that same product CSV and returns one organized ZIP:</p>
  <ul>
    <li>One folder per product, files named by SKU</li>
    <li>A manifest spreadsheet with every image, its link, SKU, and alt text, so you can verify nothing is missing</li>
    <li>A failed-downloads report listing any image that could not be fetched, instead of failing silently</li>
  </ul>
  <p>Nothing is installed on your store and no store access is needed. Your CSV is parsed in your browser, and images are downloaded as originals with no resizing. Up to 25 products is free; larger backups are a one-time $9, $19, or $39 depending on catalog size. No subscription. Files are kept for 24 hours after the export is ready, so download your ZIP and store it with the rest of your backups.</p>

  <h2>The timing rule</h2>
  <p>Do this <strong>before</strong> you delete the products or close the store, while the image links still work. After deletion, no tool can recover the images from the CSV, because the links are dead.</p>
</GuidePage>;}
