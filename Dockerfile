FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=7153
ENV FIREWALLA_IP=192.168.1.1
ENV KEY_DIR=/app/keys

EXPOSE 7153

CMD ["npm", "start"]
