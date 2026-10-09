import type {Metadata,Viewport} from 'next';
import {siteOrigin,indexable} from '../lib/seo';
import './globals.css';
export function generateMetadata():Metadata{return {metadataBase:new URL(siteOrigin()),title:{default:'Shopify Product Image Downloader & Exporter | Parcel',template:'%s | Parcel'},description:'Download and organize Shopify product images from a CSV. Free up to 25 products.',applicationName:'Parcel',robots:{index:indexable('/'),follow:indexable('/')},icons:{icon:'/favicon.svg',apple:'/apple-touch-icon.png'},formatDetection:{telephone:false}};}
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#37694c',colorScheme:'light'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;}
