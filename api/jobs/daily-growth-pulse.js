import { runGrowthPulse } from "lib/growth-pulse.js";

export const access = "scheduler";
export const methods = ["POST"];

export default async function (req,res) {
  try {
    const result = await runGrowthPulse();
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ok:false,error:String(e?.message || e)});
  }
}