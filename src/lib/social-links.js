export function configuredSocialLinks(links) {
  if (!Array.isArray(links)) return [];

  return links.filter((link) => {
    if (!link?.label || !link.url) return false;

    try {
      const profile = new URL(link.url);
      return ['http:', 'https:'].includes(profile.protocol)
        && profile.hostname.includes('.')
        && (profile.pathname !== '/' || profile.search !== '' || profile.hash !== '');
    } catch {
      return false;
    }
  });
}
