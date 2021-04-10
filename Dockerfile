FROM node:12

WORKDIR /opt/dhiti

#copy package.json file
COPY package.json /opt/dhiti

#install node packges
RUN npm install

#copy all files 
COPY . /opt/dhiti

#expose the application port
EXPOSE 4700

#start the application
CMD node app.js