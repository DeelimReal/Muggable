# Use a Node image
FROM node:18-slim

# Install Ghostscript and GraphicsMagick (Needed for pdf2pic)
RUN apt-get update && apt-get install -y \
    ghostscript \
    graphicsmagick \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Start the server
EXPOSE 3000
CMD [ "node", "server.js" ]
