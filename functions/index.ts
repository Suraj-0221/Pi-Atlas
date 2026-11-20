interface Env {
  ASSETS: {
    fetch: typeof fetch;
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const url = new URL(request.url);

  const dParam = url.searchParams.get('d');
  const nParam = url.searchParams.get('n');
  const vsParam = url.searchParams.get('vs');

  // If no dynamic preview query, pass through directly
  if (!dParam && !nParam && !vsParam) {
    return context.env.ASSETS.fetch(request);
  }

  let title = 'Find your birthday in π: π Atlas';
  let description = 'Explore 10 million digits of π. Find where your birthday, name, or photo appears in the universal constant.';

  // Sanitize and handle parameters:
  if (vsParam && /^\d{8}$/.test(vsParam)) {
    title = 'Whose birthday comes first in π? Take the challenge';
    const day = parseInt(vsParam.slice(0, 2), 10);
    const month = parseInt(vsParam.slice(2, 4), 10);
    const year = parseInt(vsParam.slice(4, 8), 10);
    const monthStr = MONTH_NAMES[month - 1] || '';
    description = `A friend's birthday (${day} ${monthStr} ${year}) is hidden in π. Enter yours to see whose comes first!`;
  } else if (dParam && /^\d{8}$/.test(dParam)) {
    const day = parseInt(dParam.slice(0, 2), 10);
    const month = parseInt(dParam.slice(2, 4), 10);
    const year = parseInt(dParam.slice(4, 8), 10);
    const monthStr = MONTH_NAMES[month - 1] || '';
    title = `${day} ${monthStr} ${year} in π: find yours`;
    description = `See the exact digit position where ${day} ${monthStr} ${year} appears in 10,000,000 digits of π.`;
  } else if (nParam && /^[a-zA-Z]{1,20}$/.test(nParam)) {
    const cleanName = nParam.trim().toUpperCase();
    title = `${cleanName} in π: find yours`;
    description = `See where ${cleanName} appears in 10,000,000 digits of π using telephone keypad cipher coordinates.`;
  }

  const response = await context.env.ASSETS.fetch(request);

  return new HTMLRewriter()
    .on('title', {
      element(e) {
        e.setInnerContent(title);
      }
    })
    .on('meta[property="og:title"]', {
      element(e) {
        e.setAttribute('content', title);
      }
    })
    .on('meta[name="twitter:title"]', {
      element(e) {
        e.setAttribute('content', title);
      }
    })
    .on('meta[property="og:description"]', {
      element(e) {
        e.setAttribute('content', description);
      }
    })
    .on('meta[name="twitter:description"]', {
      element(e) {
        e.setAttribute('content', description);
      }
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute('content', description);
      }
    })
    .transform(response);
};
