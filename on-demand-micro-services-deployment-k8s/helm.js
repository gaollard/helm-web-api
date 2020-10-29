const util = require("util");
const exec = util.promisify(require("child_process").exec);
const path = require("path");

const helmBinaryLocation =
  process.env.HELM_BINARY != undefined
    ? process.env.HELM_BINARY
    : "/home/awei/workspace/helm-web-api/bin/helm";
const helmPaseRepo =
  process.env.HELM_PASE_REPO != undefined
    ? process.env.HELM_PASE_REPO
    : "http://localhost:8879";
const helmUploadHome =
  process.env.HELM_UPLOAD_HOME != undefined
    ? process.env.HELM_UPLOAD_HOME
    : "/home/awei/upload";
/** Since the installation is via a Chart, init was already been called, no need to init again.
 * We are leaving this as a comment, in case someone will need to execute it when
 * installed via yaml files
 */
// console.log('Initializing tiller with service account: ' + process.env.TILLER_SERVICE_ACCOUNT);
// exec(helmBinaryLocation + ' init --service-account ' + process.env.TILLER_SERVICE_ACCOUNT);

// Run once init client only (because tiller is already installed, see above)
//console.log(`Initializing helm client. helm binary: ${helmBinaryLocation}`);
//exec(`${helmBinaryLocation} init --client-only --skip-refresh`);
exec(`${helmBinaryLocation} repo add pase ${helmPaseRepo}`);

class Helm {
  async install(deployOptions) {
    console.log(
      `Installing new chart. deployOptions: ${JSON.stringify(deployOptions)}`
    );
    const chartName = deployOptions.chartName;

    Helm._validateNotEmpty(chartName, "chartName");

    let installCommand = `${
      deployOptions.dryRun ? "" : "json"
    } install ${chartName}`;

    //set releaseName
    const { releaseName } = deployOptions;
    if (
      releaseName !== undefined &&
      releaseName != null &&
      releaseName !== ""
    ) {
      console.log(`Installing specified release name: ${releaseName}`);
      installCommand = `${installCommand} --name ${releaseName}`;
    }
    //set namespace
    const { namespace } = deployOptions;
    if (namespace !== undefined && namespace != null && namespace !== "") {
      console.log(`Installing specified namespace : ${namespace}`);
      installCommand = `${installCommand} --namespace ${namespace}`;
    }
    const { valueFile } = deployOptions;
    if (valueFile !== undefined && valueFile != null && valueFile !== "") {
      console.log(`Installing specified valueFile: ${valueFile}`);
      var tmpValueFile = path.join(helmUploadHome, Date.now().toString());
      var fs = require("fs");
      fs.writeFile(tmpValueFile, valueFile, function (err) {
        if (err) {
          console.log(`valueFile write failed: ${tmpValueFile} -- ${err}`);
          throw new Error(err);
        } else {
          console.log(`valueFile write successfully: ${tmpValueFile}`);
          installCommand = `${installCommand} -f ${tmpValueFile}`;
        }
      });
    }

    console.log(`Install command: ${installCommand}`);
    return this._installOrUpgradeChart(installCommand, deployOptions).then(
      (responseData) => {
        if (responseData && responseData.error) {
          const errLog = `Install command failed: ${responseData.error}`;
          console.error(errLog);
          throw new Error(errLog);
        } else if (!responseData) {
          const errLog = "Install command failed: empty response";
          console.error(errLog);
          throw new Error(errLog);
        } else {
          console.log("succesfully finished helm command");
          let json = "";
          try {
            json = JSON.parse(responseData.json);
          } catch (e) {
            json = responseData.json;
          }
          const svc = Helm._findFirstService(json);
          if (svc) {
            return {
              serviceName: svc,
              releaseName: json.releaseName,
            };
          }
          const errLog = `Install command returned unknown response: ${responseData.json}`;
          console.error(errLog);
          throw new Error(errLog);
        }
      }
    );
  }
  async simulateInstall(deployOptions) {
    console.log(
      `simulateInstall. deployOptions: ${JSON.stringify(deployOptions)}`
    );
    const chartName = deployOptions.chartName;

    Helm._validateNotEmpty(chartName, "chartName");

    let installCommand = `install ${chartName}`;

    //set releaseName
    const { releaseName } = deployOptions;
    if (
      releaseName !== undefined &&
      releaseName != null &&
      releaseName !== ""
    ) {
      console.log(`Installing specified release name: ${releaseName}`);
      installCommand = `${installCommand} --name ${releaseName}`;
    }
    //set namespace
    const { namespace } = deployOptions;
    if (namespace !== undefined && namespace != null && namespace !== "") {
      console.log(`Installing specified namespace : ${namespace}`);
      installCommand = `${installCommand} --namespace ${namespace}`;
    }
    //set version
    const { version } = deployOptions;
    if (version !== undefined && version != null && version !== "") {
      installCommand = `${installCommand} --version ${version}`;
    }
    //set values overwrite separate values with commas: key1=val1,key2=val2
    const setvalues = deployOptions.values;
    if (setvalues !== undefined && setvalues != null && setvalues !== "") {
      installCommand = `${installCommand} --set ${setvalues}`;
    }

    //set values overwrite separate values with commas: key1=val1,key2=val2
    if (Helm._notEmpty(deployOptions.dryRun)) {
      installCommand += deployOptions.dryRun;
    }
    console.log(`simulateInstall command: ${installCommand}`);
    return this._executeHelm(installCommand);
  }

  async delete(delOptions) {
    const { releaseName } = delOptions;
    Helm._validateNotEmpty(releaseName, "releaseName");

    console.log(`deleting release: ${releaseName}`);
    return this._executeHelm(`delete ${releaseName} --purge`);
  }
  async offline(delOptions) {
    const { releaseName } = delOptions;
    Helm._validateNotEmpty(releaseName, "releaseName");

    console.log(`deleting release: ${releaseName}`);
    return this._executeHelm(`delete ${releaseName}`);
  }

  async upgrade(deployOptions) {
    const chartName = deployOptions.chartName;
    const releaseName = deployOptions.releaseName;
    const namespace = deployOptions.namespace;

    Helm._validateNotEmpty(chartName, "chartName");
    Helm._validateNotEmpty(releaseName, "releaseName");
    Helm._validateNotEmpty(namespace, "namespace");

    const upgradeCommand = `upgrade ${releaseName} --namespace ${namespace} ${chartName}`;
    console.log(`upgrade command: ${upgradeCommand}`);
    await this._executeHelm("repo update");
    return this._installOrUpgradeChart(upgradeCommand, deployOptions);
  }

  async history(deployOptions) {
    const releaseName = deployOptions.releaseName;
    Helm._validateNotEmpty(releaseName, "releaseName");

    console.log(`history releaseName: ${releaseName}`);
    return this._executeHelm(`history ${releaseName}`);
  }

  async rollback(deployOptions) {
    const releaseName = deployOptions.releaseName;
    const releaseRevision = deployOptions.releaseRevision;

    Helm._validateNotEmpty(releaseName, "releaseName");
    Helm._validateNotEmpty(releaseRevision, "releaseRevision");

    console.log(`rollback ${releaseName} ${releaseRevision}`);
    return this._executeHelm(`rollback ${releaseName} ${releaseRevision}`);
  }

  async inspect(deployOptions) {
    const chartName = deployOptions.chartName;
    const command = Helm._blankFix(deployOptions.command);
    Helm._validateNotEmpty(chartName, "chartName");
    console.log(`inspect command chartName: ${command} ${chartName}`);
    const versionValues = Helm._notEmpty(deployOptions.version)
      ? ` --version ${deployOptions.version}`
      : "";
    await this._executeHelm("repo update");
    return this._executeHelm(`inspect ${command} ${chartName}`, versionValues);
  }

  async list(deployOptions) {
    console.log(`helm list`);
    let command = "list";
    if (Helm._notEmpty(deployOptions.releaseName)) {
      command += ` ${deployOptions.releaseName}`;
    }
    return this._executeHelm(command);
  }

  async repoList(deployOptions) {
    console.log(`repo list`);
    return this._executeHelm(`repo list`);
  }

  async search(deployOptions) {
    //await this._executeHelm('repo update');
    this._repoUpdate();
    const repoName = Helm._blankFix(deployOptions.repoName);
    console.log(`search repo: ${repoName}`);
    let command = `search ${repoName}`;
    if (Helm._notEmpty(deployOptions.values)) {
      command += ` ${deployOptions.values}`;
    }
    // return this._executeHelm(`search ${repoName}`, deployOptions.values || '');
    return this._executeHelm(command);
  }

  async push(deployOptions) {
    const chartFile = Helm._blankFix(deployOptions.chartFile);
    const repoName = Helm._getRepoName(deployOptions.repoName);
    Helm._validateNotEmpty(chartFile, "chartFile");
    console.log(`push chart: ${chartFile} ${repoName}`);
    const responseData = await this._executeHelm(
      `push ${chartFile} ${repoName}`
    );
    this._repoUpdate();
    return responseData;
  }

  async pushReturnName(deployOptions) {
    let returnPromise = new Promise(async (resolve, reject) => {
      let result = "";
      try {
        result = await this.push(deployOptions);
      } catch (error) {
        console.log("-----------------------------------------");
        if (error.stderr.indexOf("Error: 409:") > -1) {
          reject({
            success: false,
            msg: "package exist",
          });
        } else {
          reject({
            success: false,
            msg: error.stderr,
          });
        }
        console.log(error.stderr);
      }

      console.log(result);
      let toindex = 0;
      toindex = result.json.indexOf(" to ");
      let chartname = result.json.substr(0, toindex);
      let chartversoion = chartname.split(" ")[1];
      // the line index of name and version
      let lineIndex = chartversoion.lastIndexOf("-");
      chartname = chartversoion.substr(0, lineIndex);
      let version = chartversoion.substr(
        lineIndex + 1,
        chartversoion.length - chartname.length - 1 - 4
      );
      resolve({
        chartname: "pase/" + chartname,
        version: version,
      });
    });
    return returnPromise;
  }

  static _blankFix(arg) {
    if (typeof arg === "undefined" || arg === null || arg === "") {
      return "";
    }
    return arg;
  }

  static _getRepoName(arg) {
    if (typeof arg === "undefined" || arg === null || arg === "") {
      return "pase";
    }
    return arg;
  }

  static _validateNotEmpty(arg, argName) {
    if (typeof arg === "undefined" || arg === null || arg === "") {
      const errorMsg = `${argName} is required`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  static _notEmpty(arg) {
    const isEmpty = arg === "undefined" || arg === null || arg === "";
    return !isEmpty;
  }

  static _findFirstService(json) {
    const service = json.resources.find((el) =>
      el.name.toLowerCase().includes("/service")
    );
    return (service && service.resources[0]) || null;
  }

  static _convertToBool(obj) {
    if (obj == null) {
      return false;
    }

    // will match one and only one of the string 'true','1', or 'on' regardless
    // of capitalization and regardless of surrounding white-space.
    //
    const regex = /^\s*(true|1|on)\s*$/i;

    return regex.test(obj.toString());
  }

  async _repoUpdate() {
    console.log(`will be helm repo update`);
    await this._executeHelm(`repo  update`);
    console.log(`-----------------repo update end--------------------`);
  }

  async _executeHelm(command, values = "") {
    console.log(`command: ${command}`);
    console.log(`values: ${values}`);
    const { stdout, stderr } = await exec(
      `${helmBinaryLocation} ${command}${values}`
    );
    console.log("stdout:", stdout);
    console.log("stderr:", stderr);
    return { error: stderr, json: stdout };
  }

  static _getConfigValues(deployObject) {
    if (this.deployObject) {
      return "";
    }

    let configStr = "";
    for (const attribute in deployObject) {
      if (deployObject.hasOwnProperty(attribute)) {
        configStr += ` --set ${attribute}=${deployObject[attribute]}`;
      }
    }
    return configStr;
  }

  async _installOrUpgradeChart(command, deployOptions) {
    let updatedCmd = command;
    const chartName = deployOptions.chartName.toLowerCase();

    // when requesting install from a private repository,
    // helm repositories list must be updated first
    if (deployOptions.privateChartsRepo) {
      const tokens = chartName.split("/");
      // adds the private repo to helm known repos
      await this._executeHelm(
        `repo add ${tokens[0]} ${deployOptions.privateChartsRepo}`
      );
      // fetch the data from all known repos
      await this._executeHelm("repo update");
    }

    if (
      deployOptions.reuseValue !== undefined &&
      Helm._convertToBool(deployOptions.reuseValue)
    ) {
      updatedCmd += " --reuse-values ";
    }

    if (Helm._notEmpty(deployOptions.version)) {
      updatedCmd += ` --version ${deployOptions.version}`;
    }

    if (Helm._notEmpty(deployOptions.values)) {
      updatedCmd += ` --set ${deployOptions.values}`;
    }

    if (
      Helm._notEmpty(deployOptions.handle) &&
      deployOptions.handle === "online"
    ) {
      updatedCmd += ` --replace`;
    }

    // install the chart from one of the known repos
    // return this._executeHelm(updatedCmd, Helm._getConfigValues(deployOptions.values));
    return this._executeHelm(updatedCmd);
  }
}

module.exports = Helm;
module.exports.helmPaseRepo = helmPaseRepo
