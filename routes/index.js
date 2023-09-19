var express = require("express");
var router = express.Router();
const stock_read_log = require("../models/stock_read_log");
const FileSystem = require("fs");
const { updateMany } = require("../models/stock_read_log");

router.use("/export-data", async (req, res) => {
  const list = await stock_read_log
    .aggregate([
      {
        $match: {},
      },
    ])
    .exec();

  FileSystem.writeFile(
    "./stock_read_log.json",
    JSON.stringify(list),
    (error) => {
      if (error) throw error;
    }
  );

  console.log("stock_read_log.json exported!");
  res.json({ statusCode: 1, message: "stock_read_log.json exported!" });
});

router.use("/import-data", async (req, res) => {
  const list = await stock_read_log
    .aggregate([
      {
        $match: {},
      },
    ])
    .exec();

  FileSystem.readFile("./stock_read_log.json", async (error, data) => {
    if (error) throw error;

    const list = JSON.parse(data);

    const deletedAll = await stock_read_log.deleteMany({});

    const insertedAll = await stock_read_log.insertMany(list);

    console.log("stock_read_log.json imported!");
    res.json({ statusCode: 1, message: "stock_read_log.json imported!" });
  });
});

router.use("/edit-repacking-data", async (req, res) => {
  // Silahkan dikerjakan disini.

  const companyId = req.body.company_id;
  const payload = req.body.payload;
  const rejectQrList = req.body.reject_qr_list;
  const newQrList = req.body.new_qr_list;

  if (!companyId || !payload || !rejectQrList || !newQrList) {
    console.log("Error parsing body request. Must have 4 fields.")
    res.status(400).json({statusCode: 0, error: "Error Parsing Body Request."})
  }

  const payloadToDelete = rejectQrList.map((item) => item.payload);
  const payloadToAdd = newQrList.map((item) => item.payload);

  // update status
  try {
    const updateStatusFilter = { companyId: companyId, payload: { $in: payloadToDelete } };
    const updateStatus = {
      $set: { status: 0, status_qc: 1 },
    };
    await stock_read_log
      .updateMany(updateStatusFilter, updateStatus, { new: true })
      .exec();
  } catch(e) {
    console.log("Error updating status:", e)
    res.status(500).json({statusCode: 0, error: "Internal Server Error"})
  }

  // get moved qr_list payload
  let initMovedQrListPayload = []
  try {
    const filterMovedQrList = {
      qr_list: {
        $elemMatch: {
          payload: { $in: payloadToAdd },
        },
      },
    };
    const movedQrList = await stock_read_log.find(filterMovedQrList).exec();
    const movedQrListPayload = movedQrList.map((item) => item.payload);
    initMovedQrListPayload = movedQrListPayload
  } catch(e) {
    console.log("Error get moved qr_list payload:", e)
    res.status(500).json({statusCode: 0, error: "Internal Server Error"})
  }
  const movedFilter = { payload: { $in: initMovedQrListPayload } };

  // pull and push qr_list in the body request
  try {
    const pullAndPushFilter = { companyId: companyId, payload: payload };
    const payloadToPush = await stock_read_log
      .find({
        payload: { $in: payloadToAdd },
      })
      .exec();
  
    const updatePullQrList = {
      $pull: { qr_list: { payload: { $in: payloadToDelete } } },
    };
    await stock_read_log
      .findOneAndUpdate(pullAndPushFilter, updatePullQrList, { new: true })
      .exec();
  
    const updatePushQrList = {
      $push: { qr_list: { $each: payloadToPush } },
    };
    await stock_read_log
      .findOneAndUpdate(pullAndPushFilter, updatePushQrList, { new: true })
      .exec();
  } catch(e) {
    console.log("Error pull and push qr_list in the body request:", e)
    res.status(500).json({statusCode: 0, error: "Internal Server Error"})
  }

  // removing qr_list from old payload
  try {
    const removeQrList = {
      $pull: { qr_list: { payload: { $in: payloadToAdd } } },
    };
    await stock_read_log
      .updateMany(movedFilter, removeQrList, {
        new: true,
      })
      .exec();
  } catch(e) {
    console.log("Error removing qr_list from old payload:", e)
    res.status(500).json({statusCode: 0, error: "Internal Server Error"})
  }

  // update qty
  try {
    const updateQty = { $inc: { qty: -1 } }
    await stock_read_log.updateMany(movedFilter, updateQty , { new: true }).exec();
  } catch(e) {
    console.log("Error updating qty:", e)
    res.status(500).json({statusCode: 0, error: "Internal Server Error"})
  }

  console.log("success edit repacking data!")
  res.json({ statusCode: 1, message: "success edit repacking data!" });
});

router.use("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

module.exports = router;
