#编译镜像
docker build . -t 192.168.92.139:5000/pase/helm-web-api:v1.0

docker build . -t 30.23.18.178:80/pase/helm-web-api:v1.2.5.RELEASE

#推送镜像仓库
docker push  192.168.92.139:5000/pase/helm-web-api:v1.0

#打包chart
cd helm-web-api/chart
helm  package on-demand-micro-services-deployment

#安装helm-api
helm install on-demand-micro-services-deployment -n helm-service --namespace=default


#访问helm

#上传包
curl   http://helm-service-on-demand-micro-services-deployment.default.svc:4000/push -F "chartPackage=@/opt/helm/helm-web-api/chart/on-demand-micro-services-deployment-0.3.0.tgz"

#install
curl -H "Content-Type: application/json" -X POST  --data '{"chartName":"pase/tomcat","releaseName":"haha","namespace":"helm-proj"}'   http://helm-service-on-demand-micro-services-deployment.default.svc:4000/install

#删除
curl  http://helm-service-on-demand-micro-services-deployment.default.svc:4000/delete -d "releaseName=haha"

curl   http://helm-service-on-demand-micro-services-deployment.default.svc:4000/search
curl   http://helm-service-on-demand-micro-services-deployment.default.svc:4000/list
curl   http://helm-service-on-demand-micro-services-deployment.default.svc:4000/repolist


curl   http://helm-web-api-on-demand-micro-services-deployment.pase-system.svc:4000/repolis


使用镜像启动chartmuseum作为仓库
docker run --rm -d \
  -p 8879:8080 \
  -v $(pwd)/charts:/charts \
  --privileged=true  \
  -e DEBUG=true \
  -e STORAGE=local \
  -e STORAGE_LOCAL_ROOTDIR=/charts \
  chartmuseum/chartmuseum
