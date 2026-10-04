// Price display formatting. The decimals per provider come from
// /api/providers/config/ (class default on each backend provider,
// overridable via config.json providers.<name>.price_decimals).

export const DEFAULT_PRICE_DECIMALS = 2;

export const priceFormatForDecimals = (decimals = DEFAULT_PRICE_DECIMALS) => ({
    type: 'price',
    precision: decimals,
    minMove: 1 / 10 ** decimals,
});

export const formatPriceValue = (price, decimals = DEFAULT_PRICE_DECIMALS) =>
    price != null ? Number(price).toFixed(decimals) : '';
