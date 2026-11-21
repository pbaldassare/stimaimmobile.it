export function addressCandidates(results) {
  return results.flatMap(result => {
    const components = result.address_components ?? [];
    const part = type => components.find(component => component.types.includes(type));
    if (part('country')?.short_name !== 'IT') return [];
    const comune = part('administrative_area_level_3')?.long_name || part('locality')?.long_name;
    if (!comune || !result.formatted_address) return [];
    const districts = ['neighborhood','sublocality_level_1','sublocality'].map(key => part(key)?.long_name).filter(Boolean);
    return [{ label: result.formatted_address, comune, districts: [...new Set(districts)] }];
  }).slice(0,5);
}
