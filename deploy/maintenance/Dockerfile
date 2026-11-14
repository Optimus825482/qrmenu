# Merit bakım (güncelleme) sayfası: uygulama deploy sırasında kapalıyken Traefik'in yedek yönlendirmesi
# isteği buraya gönderir. Sayfanın tek kaynağı merit/public/offline.html'dir (service worker da aynısını
# gösterir); burada kopyalanır, ayrı bir kopya tutulmaz.
# Derleme bağlamı depo köküdür (docker-compose.yaml: context ../..).
FROM nginx:1.27-alpine

COPY deploy/maintenance/nginx.conf /etc/nginx/conf.d/default.conf
COPY merit/public/offline.html /usr/share/nginx/html/index.html
COPY merit/public/brand/hotels/royal-transparent.webp \
     merit/public/brand/hotels/premium-transparent.webp \
     merit/public/brand/hotels/diamond-transparent.webp \
     /usr/share/nginx/html/brand/hotels/

EXPOSE 80
