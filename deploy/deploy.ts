import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedMessenger = await deploy("EncryptedMessenger", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedMessenger contract: `, deployedMessenger.address);
};
export default func;
func.id = "deploy_encryptedMessenger"; // id required to prevent reexecution
func.tags = ["EncryptedMessenger"];
