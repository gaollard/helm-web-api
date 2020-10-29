## Port service 
FROM node:alpine

## Install Helm

# Note: Latest version of kubectl may be found at: # https://aur.archlinux.org/packages/kubectl-bin/ 
ARG KUBE_LATEST_VERSION="v1.11.0" 
# Note: Latest version of helm may be found at: # https://github.com/kubernetes/helm/releases 
ARG HELM_VERSION="v2.12.3" 


ENV HELM_BINARY="/usr/local/bin/helm"
ENV HELM_PASE_REPO="http://chartmuseum-chartmuseum.pase-system.svc:8080"

ENV HELM_HOME="/var/lib/helm"
ENV HELM_UPLOAD_HOME="/tmp/helm/upload"

RUN mkdir -p ${HELM_HOME}/plugins
RUN chmod -R 777 ${HELM_HOME}
RUN mkdir -p ${HELM_UPLOAD_HOME}
RUN chmod -R 777 ${HELM_UPLOAD_HOME}

# RUN  wget -q  http://192.168.92.139/other/kubernetes-helm/${HELM_VERSION}/helm   -O /usr/local/bin/helm   \
#     && chmod +x /usr/local/bin/helm \
#     && wget -q  http://192.168.92.139/other/kubernetes-release/${KUBE_LATEST_VERSION}/kubectl  -O /usr/local/bin/kubectl  \
#     && chmod +x /usr/local/bin/kubectl 
ADD bin/helm /usr/local/bin/helm
ADD bin/kubectl /usr/local/bin/kubectl
RUN chmod +x /usr/local/bin/helm
RUN chmod +x /usr/local/bin/kubectl
RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh
RUN helm plugin install https://github.com/Microsoft/helm-json-output --version master

# Create app directory
WORKDIR /usr/src

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install

# RUN npm --registry https://registry.npm.taobao.org install

# Bundle app source
COPY . .

RUN /usr/local/bin/helm init --client-only --skip-refresh
RUN /usr/local/bin/helm repo remove stable
RUN /usr/local/bin/helm repo remove local
RUN /usr/local/bin/helm plugin install https://github.com/chartmuseum/helm-push

RUN chmod -R 777 ${HELM_HOME}

EXPOSE 4000
CMD [ "npm", "start" ]
