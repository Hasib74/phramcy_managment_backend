FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 5000 5001 5002 5003 5004 5005 5006 5007 5008

CMD ["node", "dist/server.js"]
