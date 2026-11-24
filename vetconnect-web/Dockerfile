# Frontend VetConnect Maule (VET-19): build de producción servido por nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/vetconnect-web/browser /usr/share/nginx/html
EXPOSE 80
