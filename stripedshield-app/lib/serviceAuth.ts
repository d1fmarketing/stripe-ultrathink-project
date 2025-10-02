export function requireServiceKey(headers: Headers) {
  const k = process.env.SERVICE_KEY
  if (!k) return true // Allow if no key is configured (development)
  return headers.get('x-service-key') === k
}