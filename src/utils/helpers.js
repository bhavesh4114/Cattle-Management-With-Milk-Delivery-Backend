const toNumber = (value) => Number(value || 0);

const toDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const toNullableNumber = (value) => (value === "" || value == null ? null : Number(value));

module.exports = {
  toNumber,
  toDate,
  toNullableNumber,
};
