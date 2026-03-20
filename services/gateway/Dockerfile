FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create directories for SSL certs and Let's Encrypt challenges
RUN mkdir -p /etc/nginx/ssl /var/www/certbot

# Generate a self-signed certificate for development
# In production, mount real certs at /etc/nginx/ssl/server.crt and /etc/nginx/ssl/server.key
RUN apk add --no-cache openssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/server.key \
      -out /etc/nginx/ssl/server.crt \
      -subj "/C=US/ST=State/L=City/O=DSV-CLIQ/CN=localhost" && \
    apk del openssl

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
