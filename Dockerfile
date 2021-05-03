FROM node:12

WORKDIR /opt/reports

#copy package.json file
COPY package.json /opt/reports

#install node packges
RUN npm install

#copy all files 
COPY . /opt/reports

#expose the application port
EXPOSE 3000

#start the application
CMD node app.js