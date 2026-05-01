const apiFeatures = require('../util/apiFeatures');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');

exports.getAll = (Model) => {
  return catchAsync(async (req, res, next) => {
    let filter = {};
    if (req.params.hoteId) filter = { hotel: req.params.hoteId };

    const features = new apiFeatures(Model.find(filter), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();
    const doc = await features.query;

    res.status(200).json({
      status: 'success',
      result: doc.length,
      data: {
        data: doc
      }
    });
  });
};

exports.getOne = (Model, popOptions, paramVal) => {
  return catchAsync(async (req, res, next) => {
    let query;
    if (paramVal === 'slug') {
      query = Model.findOne({ slug: req.params[paramVal] });
    } else if (paramVal === 'id') {
      query = Model.findById(req.params[paramVal]);
    }
    if (popOptions) query = query.populate(popOptions);

    const doc = await query;

    if (!doc) {
      return next(new AppError('No document found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc
      }
    });
  });
};

exports.createOne = (Model) => {
  return catchAsync(async (req, res, next) => {
    const doc = await Model.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        data: doc
      }
    });
  });
};

exports.updateOne = (Model) => {
  return catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc
      }
    });
  });
};

exports.deleteOne = (Model) => {
  return catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  });
};
