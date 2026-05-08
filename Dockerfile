FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html mobile-preview.html ./
COPY src ./src
COPY assets ./assets
COPY docs ./docs

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
