const express = require("express");
const bodyParser = require("body-parser");
const Helm = require("./on-demand-micro-services-deployment-k8s/helm");
const PortsAllocator = require("./on-demand-micro-services-deployment-k8s/ports-allocator");
const IngressManager = require("./on-demand-micro-services-deployment-k8s/ingress-manager");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const helmUploadHome =
  process.env.HELM_UPLOAD_HOME != undefined
    ? process.env.HELM_UPLOAD_HOME
    : "upload";

const app = express();
var multer = require("multer");
var upload = multer({ dest: helmUploadHome });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

var fs = require("fs");
var path = require("path");
var unzipper = require("unzipper");
const handlePackage = "handle-package";
var request = require('request');

/**
 * Installs the requested chart into the Kubernetes cluster
 */
app.post("/install", async (req, res) => {
  const deployOptions = req.body;

  const helm = new Helm();
  await helm
    .install(deployOptions)
    .then((installResponse) => {
      res.send({
        success: true,
        serviceName: installResponse.serviceName,
        releaseName: installResponse.releaseName,
      });
    })
    .catch((err) => {
      console.error(
        `Chart installation failed with exception :${err.toString()}`
      );
      res.statusCode = 200;
      let msg = err.toString();
      if (err.toString().indexOf("already exists") > -1) {
        msg = "application already exists";
      }
      res.send({
        success: false,
        msg: msg,
        reson: `${err.toString()}`,
      });
    });
});

app.post("/simulateInstall", async (req, res) => {
  const deployOptions = req.body;
  deployOptions.dryRun = " --dry-run --debug";
  const helm = new Helm();
  await helm
    .simulateInstall(deployOptions)
    .then((installResponse) => {
      res.send({
        success: true,
        helm: installResponse,
      });
    })
    .catch((err) => {
      console.error(
        `Chart installation failed with exception :${err.toString()}`
      );
      res.statusCode = 200;
      let msg = err.toString();
      if (err.toString().indexOf("already exists") > -1) {
        msg = "application already exists";
      }
      res.send({
        success: false,
        msg: msg,
        reson: `${err.toString()}`,
      });
    });
});

/**
 * 健康检查
 **/
app.get('/health', async (req, res) => {
  const helmPaseRepo =
  process.env.HELM_PASE_REPO != undefined
    ? process.env.HELM_PASE_REPO
    : "http://localhost:8879";
  const url = helmPaseRepo + '/health'

  request({ url: url, method: 'GET' }, function (_err, _res, body) {
    console.log('_err >>>> ', _err)
    console.log('body >>>> ', _err)
    if (!_err) {
      res.statusCode = 500;
      // res.json(body);
      res.send(body);
    } else {
      res.statusCode = 200;
      res.send(body);
    }
  })
})

/**
 * Deletes an already installed chart, identified by its release name
 */
app.post("/delete", async (req, res) => {
  execPost(req, res, "delete");
});
/**
 * offline an already installed chart, identified by its release name
 */
app.post("/offline", async (req, res) => {
  execPost(req, res, "offline");
});

/**
 * Upgrades an already installed chart, identified by its release name
 */
app.post("/upgrade", async (req, res) => {
  execPost(req, res, "upgrade");
});

// Ports allocator functionallity

/**
 * Get a single unused port in the ingress controller
 */
app.get("/getPort", async (req, res, next) => {
  const portService = new PortsAllocator();
  const { lbip } = req.body;

  await portService
    .getPort(lbip)
    .then((data) => {
      res.send(data);
    })
    .catch(next);
});

// Ingress controller functionallity

/**
 * Sets an inbound rule in the ingress controller, to expose a service endpoint
 */
app.post("/setrule", async (req, res) => {
  // init params
  const {
    serviceName,
    servicePort,
    loadBalancerIp,
    loadBalancerPort,
    release,
  } = req.body;

  const ingressManager = new IngressManager();
  await ingressManager
    .setRule(
      serviceName,
      servicePort,
      loadBalancerPort,
      loadBalancerIp,
      release
    )
    .then((response) => {
      res.send({
        status: "success",
        ip: response.ip,
        port: response.port,
        releaseName: response.releaseName,
      });
    })
    .catch((err) => {
      console.error(`Setting rule failed with exception :${err.toString()}`);
      res.statusCode = 500;
      res.send({
        status: "failed",
        reason: "Failed setting rule",
      });
    });
});

//helm repo list
app.get("/repoList", async (req, res) => {
  execGet(req, res, "repoList");
});

//helm search [repoName]
app.get("/search", async (req, res) => {
  execGet(req, res, "search");
});

//helm inspect
app.get("/inspect", async (req, res) => {
  execGet(req, res, "inspect");
});

//helm list
app.get("/list", async (req, res) => {
  execGet(req, res, "list");
});

//helm history
app.get("/history", async (req, res) => {
  execGet(req, res, "history");
});

//helm rollback
app.post("/rollback", async (req, res) => {
  execPost(req, res, "rollback");
});

//helm repoUpdate
app.get("/repoUpdate", async (req, res) => {
  execGet(req, res, "_repoUpdate");
});

//下载应用包
app.get("/download", async (req, res) => {
  const { chartName, chartVersion } = req.query;
  const { stdout, stderr } = await exec(
    `cd ${handlePackage} && helm fetch ${chartName} --version ${chartVersion}`
  ).catch((e) => {
    console.log(`fetch ${chartName} --version ${chartVersion}错误：：：`, e);
    res.statusCode = 200;
    let msg = e.toString();
    res.send({
      success: false,
      msg: msg,
      reson: `${e.toString()}`,
    });
  });
  console.log(stdout, stderr);
  var chartFile = path.resolve(
    __dirname,
    `./${handlePackage}/${chartName.split("/")[1]}-${chartVersion}.tgz`
  );
  fs.createReadStream(chartFile).pipe(res);
});
//上传zip包
app.post("/pushzip", upload.single("chartPackage"), async (req, res) => {
  var zipFile = req.file.path;
  const { chartName, chartVersion } = req.body;
  fs.stat(zipFile, function (err, stats) {
    if (stats.isFile()) {
      console.log(`开始解压 ${zipFile}`);
      fs.createReadStream(zipFile)
        .pipe(unzipper.Extract({ path: `${handlePackage}` }))
        .on("close", async function () {
          console.log(`开始helm package ${zipFile}`);
          const { stdout, stderr } = await exec(
            `cd ${handlePackage} && helm package ${chartName}`
          ).catch((e) => {
            console.log("helm package打包错误：：：", e);
            res.statusCode = 200;
            let msg = e.toString();
            res.send({
              success: false,
              msg: msg,
              reson: `${e.toString()}`,
            });
          });
          console.log(stdout, stderr);

          var chartFile = path.resolve(
            __dirname,
            `./${handlePackage}/${chartName}-${chartVersion}.tgz`
          );
          console.log(`chartFile路径：${chartFile}`);
          req.body.chartFile = chartFile;

          execPost(req, res, "pushReturnName", () =>
            exec(
              `rm -rf ${handlePackage}/${chartName} ${handlePackage}/${chartName}-${chartVersion}.tgz`
            )
          );
        });
    }
  });
});

app.post("/push", upload.single("chartPackage"), async (req, res) => {
  console.log("will be push file -- ");
  console.log(req.file);
  //接受文件，放本地
  //获得本地路径名称 chartFile
  var chartFile = req.file.path;

  req.body.chartFile = chartFile;
  execPost(req, res, "pushReturnName");
});

//通用get方法
async function execGet(req, res, functionName) {
  const deployOptions = req.query;
  const helm = new Helm();
  await helm[functionName](deployOptions)
    .then((execGetResponse) => {
      res.send(execGetResponse);
    })
    .catch((err) => {
      console.error(
        `helm-api ${functionName} failed with exception :${err.toString()}`
      );
      res.statusCode = 500;
      res.send({
        status: "failed",
        reason: `execGet failed:${err.toString()}`,
      });
    });
}

//通用post方法
async function execPost(req, res, functionName, cb) {
  const deployOptions = req.body;
  const helm = new Helm();
  await helm[functionName](deployOptions)
    .then((execPostResponse) => {
      let result = {
        success: true,
        msg: "",
        data: "",
      };
      result.data = execPostResponse;
      res.send(result);
    })
    .finally(() => cb && cb())
    .catch((err) => {
      console.error(
        `helm-api ${functionName} failed with exception :${err.toString()}`
      );
      res.statusCode = 500;
      res.send({
        success: err.success,
        msg: err.msg,
      });
    });
}

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

app.set("port", process.env.PORT || 4000);

const server = app.listen(app.get("port"), () => {
  console.log(`Server listening on port ${server.address().port}`);
});
