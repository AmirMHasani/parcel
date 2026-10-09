import {siteOrigin,sitemapPaths} from '../../lib/seo';
export async function GET(){const body=sitemapPaths().length?`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /results\nSitemap: ${siteOrigin()}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n';return new Response(body,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=300'}});}
