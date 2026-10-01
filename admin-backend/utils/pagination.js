const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePagination(query = {}) {
  let page = Number.parseInt(query.page, 10);
  if (Number.isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  let limit = Number.parseInt(query.limit, 10);
  if (Number.isNaN(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  } else if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    maxLimit: MAX_LIMIT
  };
}

function formatPaginationResult({ page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  formatPaginationResult
};
