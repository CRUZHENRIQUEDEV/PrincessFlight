// Versão: 1.0
import type { Airport, Region } from '../domain/types';

type AirportSeed = [
  iata: string,
  city: string,
  name: string,
  state: string,
  region: Region,
  country: string,
  latitude: number,
  longitude: number,
  coastal: boolean,
];

// JOI entra como acesso ao litoral norte de Santa Catarina.
const AIRPORT_SEEDS: AirportSeed[] = [
  ['GRU', 'São Paulo', 'Guarulhos', 'SP', 'sudeste', 'BR', -23.4356, -46.4731, false],
  ['CGH', 'São Paulo', 'Congonhas', 'SP', 'sudeste', 'BR', -23.6261, -46.6566, false],
  ['VCP', 'Campinas', 'Viracopos', 'SP', 'sudeste', 'BR', -23.0074, -47.1345, false],
  ['GIG', 'Rio de Janeiro', 'Galeão', 'RJ', 'sudeste', 'BR', -22.809, -43.2505, true],
  ['SDU', 'Rio de Janeiro', 'Santos Dumont', 'RJ', 'sudeste', 'BR', -22.9105, -43.1631, true],
  ['CFB', 'Cabo Frio', 'Cabo Frio', 'RJ', 'sudeste', 'BR', -22.9211, -42.0743, true],
  ['VIX', 'Vitória', 'Eurico de Aguiar Salles', 'ES', 'sudeste', 'BR', -20.2581, -40.2864, true],
  ['CNF', 'Belo Horizonte', 'Confins', 'MG', 'sudeste', 'BR', -19.6336, -43.9686, false],
  ['BSB', 'Brasília', 'Presidente Juscelino Kubitschek', 'DF', 'centro-oeste', 'BR', -15.8711, -47.9186, false],
  ['CGR', 'Campo Grande', 'Campo Grande', 'MS', 'centro-oeste', 'BR', -20.4686, -54.6725, false],
  ['CGB', 'Cuiabá', 'Marechal Rondon', 'MT', 'centro-oeste', 'BR', -15.6529, -56.1168, false],
  ['GYN', 'Goiânia', 'Santa Genoveva', 'GO', 'centro-oeste', 'BR', -16.632, -49.2207, false],
  ['SSA', 'Salvador', 'Deputado Luís Eduardo Magalhães', 'BA', 'nordeste', 'BR', -12.9086, -38.3225, true],
  ['IOS', 'Ilhéus', 'Ilhéus', 'BA', 'nordeste', 'BR', -14.8159, -39.0335, true],
  ['BPS', 'Porto Seguro', 'Porto Seguro', 'BA', 'nordeste', 'BR', -16.4386, -39.0809, true],
  ['REC', 'Recife', 'Guararapes', 'PE', 'nordeste', 'BR', -8.1265, -34.9236, true],
  ['FEN', 'Fernando de Noronha', 'Fernando de Noronha', 'PE', 'nordeste', 'BR', -3.8549, -32.4233, true],
  ['NAT', 'Natal', 'Aluízio Alves', 'RN', 'nordeste', 'BR', -5.9114, -35.2477, true],
  ['JPA', 'João Pessoa', 'Presidente Castro Pinto', 'PB', 'nordeste', 'BR', -7.1484, -34.9507, true],
  ['MCZ', 'Maceió', 'Zumbi dos Palmares', 'AL', 'nordeste', 'BR', -9.5108, -35.7917, true],
  ['AJU', 'Aracaju', 'Santa Maria', 'SE', 'nordeste', 'BR', -10.984, -37.0703, true],
  ['FOR', 'Fortaleza', 'Pinto Martins', 'CE', 'nordeste', 'BR', -3.7763, -38.5326, true],
  ['JJD', 'Jericoacoara', 'Comandante Ariston Pessoa', 'CE', 'nordeste', 'BR', -2.906, -40.357, true],
  ['PHB', 'Parnaíba', 'Parnaíba', 'PI', 'nordeste', 'BR', -2.8938, -41.732, true],
  ['SLZ', 'São Luís', 'Marechal Cunha Machado', 'MA', 'nordeste', 'BR', -2.5854, -44.2341, true],
  ['BEL', 'Belém', 'Val de Cans', 'PA', 'norte', 'BR', -1.3793, -48.4763, true],
  ['MCP', 'Macapá', 'Macapá', 'AP', 'norte', 'BR', 0.0506, -51.0722, true],
  ['MAO', 'Manaus', 'Eduardo Gomes', 'AM', 'norte', 'BR', -3.0386, -60.0497, false],
  ['FLN', 'Florianópolis', 'Hercílio Luz', 'SC', 'sul', 'BR', -27.6703, -48.5525, true],
  ['NVT', 'Navegantes', 'Navegantes', 'SC', 'sul', 'BR', -26.8792, -48.6514, true],
  ['JOI', 'Joinville', 'Lauro Carneiro de Loyola', 'SC', 'sul', 'BR', -26.2245, -48.7974, true],
  ['CWB', 'Curitiba', 'Afonso Pena', 'PR', 'sul', 'BR', -25.5285, -49.1758, false],
  ['IGU', 'Foz do Iguaçu', 'Cataratas', 'PR', 'sul', 'BR', -25.6003, -54.485, false],
  ['POA', 'Porto Alegre', 'Salgado Filho', 'RS', 'sul', 'BR', -29.9944, -51.1714, false],
  ['LIS', 'Lisboa', 'Humberto Delgado', 'PT', 'internacional', 'PT', 38.7742, -9.1342, false],
  ['OPO', 'Porto', 'Francisco Sá Carneiro', 'PT', 'internacional', 'PT', 41.2481, -8.6814, false],
  ['MAD', 'Madri', 'Barajas', 'ES', 'internacional', 'ES', 40.4983, -3.5676, false],
  ['BCN', 'Barcelona', 'El Prat', 'ES', 'internacional', 'ES', 41.2974, 2.0833, false],
  ['CDG', 'Paris', 'Charles de Gaulle', 'FR', 'internacional', 'FR', 49.0097, 2.5479, false],
  ['FCO', 'Roma', 'Fiumicino', 'IT', 'internacional', 'IT', 41.8003, 12.2389, false],
  ['LHR', 'Londres', 'Heathrow', 'GB', 'internacional', 'GB', 51.47, -0.4543, false],
  ['MIA', 'Miami', 'Miami', 'US', 'internacional', 'US', 25.7959, -80.287, false],
  ['MCO', 'Orlando', 'Orlando', 'US', 'internacional', 'US', 28.4312, -81.3081, false],
  ['JFK', 'Nova York', 'John F. Kennedy', 'US', 'internacional', 'US', 40.6413, -73.7781, false],
  ['CUN', 'Cancún', 'Cancún', 'MX', 'internacional', 'MX', 21.0365, -86.8771, false],
  ['EZE', 'Buenos Aires', 'Ezeiza', 'AR', 'internacional', 'AR', -34.8222, -58.5358, false],
  ['SCL', 'Santiago', 'Arturo Merino Benítez', 'CL', 'internacional', 'CL', -33.3929, -70.7858, false],
  ['MVD', 'Montevidéu', 'Carrasco', 'UY', 'internacional', 'UY', -34.8384, -56.0308, false],
  ['PTY', 'Cidade do Panamá', 'Tocumen', 'PA', 'internacional', 'PA', 9.0714, -79.3835, false],
  ['LIM', 'Lima', 'Jorge Chávez', 'PE', 'internacional', 'PE', -12.0219, -77.1143, false],
];

export const AIRPORTS: Airport[] = AIRPORT_SEEDS.map((seed) => toAirport(seed));

function toAirport(seed: AirportSeed): Airport {
  const [iata, city, name, state, region, country, latitude, longitude, coastal] = seed;
  return { iata, city, name, state, region, country, latitude, longitude, coastal };
}
