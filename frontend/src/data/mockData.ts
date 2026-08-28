export type RiskLevel = 'Critical' | 'High' | 'Moderate' | 'Low';
export type PlaceType = 'gram_panchayat' | 'municipality' | 'municipal_corporation' | 'city';

export interface Place {
  id: number;
  name: string;
  nameMalayalam: string;
  district: string;
  type: PlaceType;
  lat: number;
  lon: number;
  elevation: number;
  slope: number;
  distToWaterM: number;
  vegetationPct: number;
  builtupPct: number;
}

export interface RiskResult {
  place: Place;
  floodProbability: number;
  floodRiskLevel: RiskLevel;
  landslideRiskLevel: RiskLevel;
  landslideConfidence: number;
  rainfall7dayMm: number;
  rainfall24hMm: number;
  windspeedKmh: number;
  queriedAt: string;
  floodAccuracy: number;
  landslideAccuracy: number;
}

export interface Alert {
  id: number;
  placeId: number;
  placeName: string;
  district: string;
  riskLevel: RiskLevel;
  message: string;
  issuedAt: string;
  type: 'flood' | 'landslide' | 'combined';
  affectedPopulation?: number;
}

export interface HistoricalQuery {
  date: string;
  highRiskCount: number;
  criticalCount: number;
  moderateCount: number;
  totalQueries: number;
}

export interface DamageRecord {
  id: number;
  placeName: string;
  district: string;
  damageClass: 'no-damage' | 'minor-damage' | 'major-damage' | 'destroyed';
  confidence: number;
  eventDate: string;
}

export const keralaPlaces: Place[] = [
  { id: 1, name: 'Wayanad', nameMalayalam: 'വയനാട്', district: 'Wayanad', type: 'city', lat: 11.6854, lon: 76.1320, elevation: 876, slope: 18.4, distToWaterM: 240, vegetationPct: 72.3, builtupPct: 8.1 },
  { id: 2, name: 'Munnar', nameMalayalam: 'മൂന്നാർ', district: 'Idukki', type: 'city', lat: 10.0892, lon: 77.0595, elevation: 1524, slope: 24.7, distToWaterM: 180, vegetationPct: 68.9, builtupPct: 6.2 },
  { id: 3, name: 'Kochi', nameMalayalam: 'കൊച്ചി', district: 'Ernakulam', type: 'municipal_corporation', lat: 9.9312, lon: 76.2673, elevation: 4, slope: 0.8, distToWaterM: 60, vegetationPct: 22.1, builtupPct: 64.3 },
  { id: 4, name: 'Thiruvananthapuram', nameMalayalam: 'തിരുവനന്തപുരം', district: 'Thiruvananthapuram', type: 'municipal_corporation', lat: 8.5241, lon: 76.9366, elevation: 16, slope: 2.3, distToWaterM: 320, vegetationPct: 28.4, builtupPct: 58.7 },
  { id: 5, name: 'Kozhikode', nameMalayalam: 'കോഴിക്കോട്', district: 'Kozhikode', type: 'municipal_corporation', lat: 11.2588, lon: 75.7804, elevation: 8, slope: 1.2, distToWaterM: 90, vegetationPct: 31.2, builtupPct: 52.4 },
  { id: 6, name: 'Thrissur', nameMalayalam: 'തൃശ്ശൂർ', district: 'Thrissur', type: 'municipal_corporation', lat: 10.5276, lon: 76.2144, elevation: 26, slope: 1.6, distToWaterM: 450, vegetationPct: 33.8, builtupPct: 49.2 },
  { id: 7, name: 'Idukki', nameMalayalam: 'ഇടുക്കി', district: 'Idukki', type: 'municipality', lat: 9.8480, lon: 76.9720, elevation: 752, slope: 16.2, distToWaterM: 140, vegetationPct: 61.4, builtupPct: 12.8 },
  { id: 8, name: 'Malappuram', nameMalayalam: 'മലപ്പുറം', district: 'Malappuram', type: 'municipality', lat: 11.0732, lon: 76.0741, elevation: 48, slope: 4.1, distToWaterM: 620, vegetationPct: 42.6, builtupPct: 38.9 },
  { id: 9, name: 'Palakkad', nameMalayalam: 'പാലക്കാട്', district: 'Palakkad', type: 'municipality', lat: 10.7867, lon: 76.6548, elevation: 79, slope: 2.8, distToWaterM: 380, vegetationPct: 36.1, builtupPct: 44.5 },
  { id: 10, name: 'Alappuzha', nameMalayalam: 'ആലപ്പുഴ', district: 'Alappuzha', type: 'municipality', lat: 9.4981, lon: 76.3388, elevation: 1, slope: 0.2, distToWaterM: 30, vegetationPct: 18.4, builtupPct: 48.2 },
  { id: 11, name: 'Kollam', nameMalayalam: 'കൊല്ലം', district: 'Kollam', type: 'municipal_corporation', lat: 8.8932, lon: 76.6141, elevation: 12, slope: 1.4, distToWaterM: 80, vegetationPct: 29.7, builtupPct: 55.1 },
  { id: 12, name: 'Kannur', nameMalayalam: 'കണ്ണൂർ', district: 'Kannur', type: 'municipal_corporation', lat: 11.8745, lon: 75.3704, elevation: 28, slope: 3.2, distToWaterM: 120, vegetationPct: 35.6, builtupPct: 47.8 },
  { id: 13, name: 'Kasaragod', nameMalayalam: 'കാസർഗോഡ്', district: 'Kasaragod', type: 'municipality', lat: 12.4996, lon: 74.9869, elevation: 22, slope: 2.6, distToWaterM: 190, vegetationPct: 38.2, builtupPct: 41.3 },
  { id: 14, name: 'Pathanamthitta', nameMalayalam: 'പത്തനംതിട്ട', district: 'Pathanamthitta', type: 'municipality', lat: 9.2648, lon: 76.7870, elevation: 42, slope: 5.8, distToWaterM: 210, vegetationPct: 48.9, builtupPct: 32.4 },
  { id: 15, name: 'Kottayam', nameMalayalam: 'കോട്ടയം', district: 'Kottayam', type: 'municipality', lat: 9.5916, lon: 76.5222, elevation: 35, slope: 3.4, distToWaterM: 290, vegetationPct: 44.2, builtupPct: 38.7 },
  { id: 16, name: 'Perinthalmanna', nameMalayalam: 'പെരിന്തൽമണ്ണ', district: 'Malappuram', type: 'municipality', lat: 10.9747, lon: 76.2288, elevation: 56, slope: 4.9, distToWaterM: 340, vegetationPct: 45.1, builtupPct: 31.2 },
  { id: 17, name: 'Attappady', nameMalayalam: 'ആട്ടപ്പാടി', district: 'Palakkad', type: 'gram_panchayat', lat: 10.9836, lon: 76.7142, elevation: 648, slope: 14.8, distToWaterM: 170, vegetationPct: 66.2, builtupPct: 7.4 },
  { id: 18, name: 'Chalakudy', nameMalayalam: 'ചാലക്കുടി', district: 'Thrissur', type: 'municipality', lat: 10.3007, lon: 76.3318, elevation: 18, slope: 1.8, distToWaterM: 160, vegetationPct: 37.4, builtupPct: 43.8 },
];

export const mockRiskResults: Record<number, RiskResult> = {
  1: {
    place: keralaPlaces[0],
    floodProbability: 0.24,
    floodRiskLevel: 'Low',
    landslideRiskLevel: 'Critical',
    landslideConfidence: 0.91,
    rainfall7dayMm: 312.4,
    rainfall24hMm: 48.2,
    windspeedKmh: 22.4,
    queriedAt: '2024-08-03T14:32:11Z',
    floodAccuracy: 0.874,
    landslideAccuracy: 0.912,
  },
  2: {
    place: keralaPlaces[1],
    floodProbability: 0.18,
    floodRiskLevel: 'Low',
    landslideRiskLevel: 'High',
    landslideConfidence: 0.84,
    rainfall7dayMm: 278.6,
    rainfall24hMm: 61.4,
    windspeedKmh: 18.7,
    queriedAt: '2024-08-03T14:28:44Z',
    floodAccuracy: 0.874,
    landslideAccuracy: 0.912,
  },
  3: {
    place: keralaPlaces[2],
    floodProbability: 0.82,
    floodRiskLevel: 'Critical',
    landslideRiskLevel: 'Low',
    landslideConfidence: 0.76,
    rainfall7dayMm: 194.2,
    rainfall24hMm: 32.8,
    windspeedKmh: 31.2,
    queriedAt: '2024-08-03T13:58:02Z',
    floodAccuracy: 0.874,
    landslideAccuracy: 0.912,
  },
  10: {
    place: keralaPlaces[9],
    floodProbability: 0.94,
    floodRiskLevel: 'Critical',
    landslideRiskLevel: 'Low',
    landslideConfidence: 0.62,
    rainfall7dayMm: 241.8,
    rainfall24hMm: 54.6,
    windspeedKmh: 28.9,
    queriedAt: '2024-08-03T14:01:33Z',
    floodAccuracy: 0.874,
    landslideAccuracy: 0.912,
  },
};

export const activeAlerts: Alert[] = [
  {
    id: 1,
    placeId: 1,
    placeName: 'Wayanad',
    district: 'Wayanad',
    riskLevel: 'Critical',
    message: 'Extreme landslide risk. Steep terrain saturated by 312mm rainfall over 7 days. Immediate evacuation advisory for hillside settlements.',
    issuedAt: '2024-08-03T12:00:00Z',
    type: 'landslide',
    affectedPopulation: 18400,
  },
  {
    id: 2,
    placeId: 3,
    placeName: 'Kochi',
    district: 'Ernakulam',
    riskLevel: 'Critical',
    message: 'Critical flood probability (82%). Low-lying coastal zones and backwater-adjacent areas face inundation. Close floodgates on Vembanad spillways.',
    issuedAt: '2024-08-03T11:30:00Z',
    type: 'flood',
    affectedPopulation: 324000,
  },
  {
    id: 3,
    placeId: 10,
    placeName: 'Alappuzha',
    district: 'Alappuzha',
    riskLevel: 'Critical',
    message: 'Critical flood risk. Elevation near sea-level (1m). Heavy sustained rainfall across catchment threatening canal overflow and paddy field inundation.',
    issuedAt: '2024-08-03T11:15:00Z',
    type: 'flood',
    affectedPopulation: 97600,
  },
  {
    id: 4,
    placeId: 2,
    placeName: 'Munnar',
    district: 'Idukki',
    riskLevel: 'High',
    message: 'High landslide risk. Elevation 1524m with 24.7° average slope. Continuous rainfall advisory in effect. Tea estate roads may become impassable.',
    issuedAt: '2024-08-03T10:45:00Z',
    type: 'landslide',
    affectedPopulation: 8200,
  },
  {
    id: 5,
    placeId: 7,
    placeName: 'Idukki',
    district: 'Idukki',
    riskLevel: 'High',
    message: 'High combined risk. Dam reservoir levels elevated. Downstream communities should remain on standby for evacuation notice.',
    issuedAt: '2024-08-03T10:00:00Z',
    type: 'combined',
    affectedPopulation: 12800,
  },
  {
    id: 6,
    placeId: 17,
    placeName: 'Attappady',
    district: 'Palakkad',
    riskLevel: 'Moderate',
    message: 'Moderate landslide risk in tribal settlement zones. Soil moisture at 78% saturation. Monitor for debris flow near ravine corridors.',
    issuedAt: '2024-08-03T09:30:00Z',
    type: 'landslide',
    affectedPopulation: 4100,
  },
];

export const historicalData: HistoricalQuery[] = [
  { date: 'Jul 28', highRiskCount: 4, criticalCount: 1, moderateCount: 9, totalQueries: 128 },
  { date: 'Jul 29', highRiskCount: 5, criticalCount: 2, moderateCount: 11, totalQueries: 201 },
  { date: 'Jul 30', highRiskCount: 7, criticalCount: 3, moderateCount: 14, totalQueries: 287 },
  { date: 'Jul 31', highRiskCount: 9, criticalCount: 4, moderateCount: 16, totalQueries: 341 },
  { date: 'Aug 01', highRiskCount: 11, criticalCount: 6, moderateCount: 18, totalQueries: 412 },
  { date: 'Aug 02', highRiskCount: 14, criticalCount: 8, moderateCount: 20, totalQueries: 498 },
  { date: 'Aug 03', highRiskCount: 16, criticalCount: 11, moderateCount: 22, totalQueries: 573 },
];

export const districtRiskRanking = [
  { district: 'Wayanad', floodRisk: 28, landslideRisk: 94, combined: 91 },
  { district: 'Idukki', floodRisk: 35, landslideRisk: 87, combined: 84 },
  { district: 'Alappuzha', floodRisk: 91, landslideRisk: 12, combined: 82 },
  { district: 'Ernakulam', floodRisk: 84, landslideRisk: 18, combined: 79 },
  { district: 'Malappuram', floodRisk: 52, landslideRisk: 63, combined: 68 },
  { district: 'Kozhikode', floodRisk: 61, landslideRisk: 44, combined: 62 },
  { district: 'Palakkad', floodRisk: 45, landslideRisk: 58, combined: 58 },
  { district: 'Thrissur', floodRisk: 48, landslideRisk: 32, combined: 46 },
  { district: 'Pathanamthitta', floodRisk: 39, landslideRisk: 47, combined: 44 },
  { district: 'Kollam', floodRisk: 42, landslideRisk: 28, combined: 38 },
];

export const recentDamageRecords: DamageRecord[] = [
  { id: 1, placeName: 'Wayanad', district: 'Wayanad', damageClass: 'major-damage', confidence: 0.88, eventDate: '2024-08-01' },
  { id: 2, placeName: 'Munnar', district: 'Idukki', damageClass: 'minor-damage', confidence: 0.74, eventDate: '2024-07-30' },
  { id: 3, placeName: 'Alappuzha', district: 'Alappuzha', damageClass: 'destroyed', confidence: 0.92, eventDate: '2024-07-28' },
  { id: 4, placeName: 'Chalakudy', district: 'Thrissur', damageClass: 'no-damage', confidence: 0.81, eventDate: '2024-07-27' },
];

export const riskColor: Record<RiskLevel, string> = {
  Critical: '#B54A2A',
  High: '#D99A2B',
  Moderate: '#7C9A3C',
  Low: '#1F6F64',
};

export const riskBg: Record<RiskLevel, string> = {
  Critical: 'rgba(181, 74, 42, 0.15)',
  High: 'rgba(217, 154, 43, 0.12)',
  Moderate: 'rgba(124, 154, 60, 0.12)',
  Low: 'rgba(31, 111, 100, 0.12)',
};

export const damageLabel: Record<DamageRecord['damageClass'], string> = {
  'no-damage': 'No Damage',
  'minor-damage': 'Minor Damage',
  'major-damage': 'Major Damage',
  'destroyed': 'Destroyed',
};

export const damageColor: Record<DamageRecord['damageClass'], string> = {
  'no-damage': '#7C9A3C',
  'minor-damage': '#D99A2B',
  'major-damage': '#B54A2A',
  'destroyed': '#8B1A1A',
};
