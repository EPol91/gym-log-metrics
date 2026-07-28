// Alimenti base inclusi nell'app: disponibili offline dalla prima apertura.
//
// Fonte: Table Ciqual 2020 — ANSES (Agence nationale de sécurité sanitaire de
// l'alimentation, de l'environnement et du travail), https://ciqual.anses.fr
// Licenza: Licence Ouverte / Open Licence (Etalab) — riuso libero con citazione.
//
// Valori per 100 g. Sono un punto di partenza, NON un vangelo: ogni alimento è
// modificabile nell'app e la correzione dell'utente (etichetta alla mano) vince sempre.
import type { Macros } from './schema'

export interface BaseFood { name: string; per100: Macros; servingG?: number; servingLabel?: string }

export const BASE_FOODS: BaseFood[] = [
  {
    name: 'Petto di pollo crudo',
    per100: {
      kcal: 110,
      protein: 23.4,
      carbs: 0,
      fat: 1.5,
      fiber: 0,
      sugar: 0,
      salt: 0.1
    }
  },
  {
    name: 'Petto di pollo cotto',
    per100: {
      kcal: 141,
      protein: 30.1,
      carbs: 0,
      fat: 2,
      fiber: 0,
      sugar: 0,
      salt: 0.1
    }
  },
  {
    name: 'Coscia di pollo cotta',
    per100: {
      kcal: 171,
      protein: 24.8,
      carbs: 0,
      fat: 8,
      fiber: 0,
      sugar: 0,
      salt: 0.3
    }
  },
  {
    name: 'Fesa di tacchino cruda',
    per100: {
      kcal: 109,
      protein: 24.1,
      carbs: 0.5,
      fat: 1.2,
      fiber: 0,
      sugar: 0.3,
      salt: 0.2
    }
  },
  {
    name: 'Fesa di tacchino cotta',
    per100: {
      kcal: 128,
      protein: 24.6,
      carbs: 0.5,
      fat: 3,
      fiber: 0,
      sugar: 0,
      salt: 0.3
    }
  },
  {
    name: 'Fesa di tacchino a fette',
    per100: {
      kcal: 104,
      protein: 20.9,
      carbs: 1.3,
      fat: 1.7,
      fiber: 0.4,
      sugar: 1.1,
      salt: 1.9
    }
  },
  {
    name: 'Manzo macinato 5% crudo',
    per100: {
      kcal: 130,
      protein: 21.9,
      carbs: 0.3,
      fat: 4.6,
      fiber: 0,
      sugar: 0,
      salt: 0.1
    }
  },
  {
    name: 'Manzo macinato 15% crudo',
    per100: {
      kcal: 209,
      protein: 20.2,
      carbs: 0.5,
      fat: 14.1,
      fiber: 0,
      sugar: 0,
      salt: 0.1
    }
  },
  {
    name: 'Bistecca di manzo cotta',
    per100: {
      kcal: 155,
      protein: 25.5,
      carbs: 0,
      fat: 5.9,
      fiber: 0,
      sugar: 0,
      salt: 0.2
    }
  },
  {
    name: 'Filetto di manzo cotto',
    per100: {
      kcal: 194,
      protein: 28.8,
      carbs: 0,
      fat: 8.7,
      fiber: 0
    }
  },
  {
    name: 'Lonza di maiale cotta',
    per100: {
      kcal: 168,
      protein: 26.1,
      carbs: 0,
      fat: 7.1,
      fiber: 0,
      salt: 0.1
    }
  },
  {
    name: 'Vitello, fesa cotta',
    per100: {
      kcal: 147,
      protein: 31,
      carbs: 0,
      fat: 2.5,
      fiber: 0,
      salt: 0.2
    }
  },
  {
    name: 'Prosciutto cotto',
    per100: {
      kcal: 117,
      protein: 20.5,
      carbs: 0.8,
      fat: 3.5,
      fiber: 0.1,
      sugar: 0.8,
      salt: 1.9
    }
  },
  {
    name: 'Prosciutto crudo',
    per100: {
      kcal: 230,
      protein: 28.7,
      carbs: 0.5,
      fat: 12.6,
      fiber: 0,
      sugar: 0.3,
      salt: 5.7
    }
  },
  {
    name: 'Salsiccia cotta',
    per100: {
      kcal: 274,
      protein: 18.8,
      carbs: 0,
      fat: 22.1,
      fiber: 0,
      sugar: 0,
      salt: 1.7
    }
  },
  {
    name: 'Tonno al naturale sgocciolato',
    per100: {
      kcal: 111,
      protein: 26.8,
      carbs: 0,
      fat: 0.4,
      fiber: 0,
      sugar: 0,
      salt: 0.7
    }
  },
  {
    name: 'Tonno crudo',
    per100: {
      kcal: 144,
      protein: 24,
      carbs: 0,
      fat: 5.4,
      fiber: 0,
      sugar: 0,
      salt: 0.1
    }
  },
  {
    name: 'Salmone crudo',
    per100: {
      kcal: 194,
      protein: 20.5,
      carbs: 0,
      fat: 12.4,
      fiber: 0.3,
      sugar: 0,
      salt: 0.2
    }
  },
  {
    name: 'Salmone cotto',
    per100: {
      kcal: 195,
      protein: 23,
      carbs: 0,
      fat: 11.5,
      fiber: 0,
      sugar: 0,
      salt: 0.1
    }
  },
  {
    name: 'Salmone affumicato',
    per100: {
      kcal: 178,
      protein: 22,
      carbs: 0.9,
      fat: 9.5,
      fiber: 0.3,
      sugar: 0,
      salt: 3.5
    }
  },
  {
    name: 'Merluzzo crudo',
    per100: {
      kcal: 78,
      protein: 18.1,
      carbs: 0,
      fat: 0.6,
      fiber: 0.2,
      sugar: 0,
      salt: 0.2
    }
  },
  {
    name: 'Merluzzo cotto',
    per100: {
      kcal: 106,
      protein: 24.5,
      carbs: 0,
      fat: 1,
      fiber: 0,
      sugar: 0,
      salt: 0.2
    }
  },
  {
    name: 'Orata cruda',
    per100: {
      kcal: 102,
      protein: 21,
      carbs: 0,
      fat: 2,
      fiber: 0,
      sugar: 0
    }
  },
  {
    name: 'Branzino crudo',
    per100: {
      kcal: 90,
      protein: 16.6,
      carbs: 0,
      fat: 2.6,
      fiber: 0,
      sugar: 0,
      salt: 0.3
    }
  },
  {
    name: 'Gamberi cotti',
    per100: {
      kcal: 94,
      protein: 19,
      carbs: 1.9,
      fat: 1.2,
      fiber: 0,
      sugar: 0.3,
      salt: 1.4
    }
  },
  {
    name: 'Cozze cotte',
    per100: {
      kcal: 108,
      protein: 17.2,
      carbs: 5.1,
      fat: 2.1,
      fiber: 0,
      salt: 0.8
    }
  },
  {
    name: 'Sgombro crudo',
    per100: {
      kcal: 194,
      protein: 18.1,
      carbs: 0,
      fat: 13.5,
      fiber: 0,
      sugar: 0,
      salt: 0.2
    }
  },
  {
    name: 'Sardine sott olio',
    per100: {
      kcal: 207,
      protein: 24.4,
      carbs: 0.5,
      fat: 12,
      fiber: 0,
      sugar: 0,
      salt: 0.8
    }
  },
  {
    name: 'Platessa cruda',
    per100: {
      kcal: 89,
      protein: 20,
      carbs: 0,
      fat: 0.9,
      fiber: 0,
      sugar: 0,
      salt: 0.2
    }
  },
  {
    name: 'Calamari crudi',
    per100: {
      kcal: 77,
      protein: 14.4,
      carbs: 2.2,
      fat: 1.2,
      fiber: 0,
      sugar: 0,
      salt: 0.6
    }
  },
  {
    name: 'Uovo intero crudo',
    per100: {
      kcal: 140,
      protein: 12.7,
      carbs: 0.3,
      fat: 9.8,
      fiber: 0,
      sugar: 0.3,
      salt: 0.3
    },
    servingG: 55,
    servingLabel: '1 uovo'
  },
  {
    name: 'Uovo sodo',
    per100: {
      kcal: 134,
      protein: 13.5,
      carbs: 0.5,
      fat: 8.6,
      fiber: 0,
      sugar: 0.5,
      salt: 0.3
    },
    servingG: 55,
    servingLabel: '1 uovo'
  },
  {
    name: 'Albume crudo',
    per100: {
      kcal: 48,
      protein: 10.8,
      carbs: 0.9,
      fat: 0.2,
      fiber: 0,
      sugar: 0.7,
      salt: 0.4
    }
  },
  {
    name: 'Tuorlo crudo',
    per100: {
      kcal: 307,
      protein: 15.5,
      carbs: 1.1,
      fat: 26.7,
      fiber: 0,
      sugar: 0.6,
      salt: 0
    }
  },
  {
    name: 'Latte parzialmente scremato',
    per100: {
      kcal: 47,
      protein: 3.4,
      carbs: 4.8,
      fat: 1.6,
      fiber: 0,
      sugar: 4.7,
      salt: 0.1
    }
  },
  {
    name: 'Latte intero',
    per100: {
      kcal: 65,
      protein: 3.3,
      carbs: 4.9,
      fat: 3.6,
      fiber: 0,
      sugar: 4.2,
      salt: 0.1
    }
  },
  {
    name: 'Latte scremato',
    per100: {
      kcal: 33,
      protein: 3.5,
      carbs: 4.6,
      fat: 0.1,
      fiber: 0,
      sugar: 4.6,
      salt: 0.1
    }
  },
  {
    name: 'Yogurt bianco',
    per100: {
      kcal: 46,
      protein: 4,
      carbs: 2.7,
      fat: 1.5,
      fiber: 3,
      sugar: 2.7,
      salt: 0.1
    }
  },
  {
    name: 'Yogurt bianco 0%',
    per100: {
      kcal: 39,
      protein: 4.8,
      carbs: 4.1,
      fat: 0.1,
      fiber: 0,
      sugar: 4.1,
      salt: 0.1
    }
  },
  {
    name: 'Fiocchi di latte 0%',
    per100: {
      kcal: 49,
      protein: 8,
      carbs: 3.9,
      fat: 0,
      fiber: 0,
      sugar: 3.9,
      salt: 0.1
    }
  },
  {
    name: 'Yogurt greco',
    per100: {
      kcal: 113,
      protein: 3.3,
      carbs: 4.2,
      fat: 9.2,
      fiber: 0.1,
      sugar: 3.9,
      salt: 0.1
    }
  },
  {
    name: 'Ricotta',
    per100: {
      kcal: 158,
      protein: 8.8,
      carbs: 4,
      fat: 11.9,
      fiber: 0,
      sugar: 2.3,
      salt: 0.3
    }
  },
  {
    name: 'Mozzarella',
    per100: {
      kcal: 227,
      protein: 16.5,
      carbs: 0.8,
      fat: 17.7,
      fiber: 0,
      sugar: 0.7,
      salt: 0.6
    }
  },
  {
    name: 'Parmigiano',
    per100: {
      kcal: 406,
      protein: 31.1,
      carbs: 0,
      fat: 31,
      fiber: 0,
      sugar: 0,
      salt: 1.6
    }
  },
  {
    name: 'Fiocchi di latte 3%',
    per100: {
      kcal: 77,
      protein: 8,
      carbs: 3.5,
      fat: 3.3,
      fiber: 0,
      sugar: 3.5,
      salt: 0.1
    }
  },
  {
    name: 'Feta',
    per100: {
      kcal: 285,
      protein: 15.1,
      carbs: 0.7,
      fat: 24.3,
      fiber: 0,
      sugar: 0,
      salt: 2.3
    }
  },
  {
    name: 'Burro',
    per100: {
      kcal: 753,
      protein: 0.7,
      carbs: 0.9,
      fat: 82.9,
      fiber: 0,
      sugar: 0.8,
      salt: 0.1
    }
  },
  {
    name: 'Panna da cucina',
    per100: {
      kcal: 297,
      protein: 2.5,
      carbs: 1.9,
      fat: 30.7,
      fiber: 3,
      sugar: 1.9,
      salt: 0.1
    }
  },
  {
    name: 'Formaggio spalmabile',
    per100: {
      kcal: 175,
      protein: 11.7,
      carbs: 1.1,
      fat: 13.1,
      fiber: 0.5,
      sugar: 0,
      salt: 1.2
    }
  },
  {
    name: 'Riso bianco crudo',
    per100: {
      kcal: 352,
      protein: 7,
      carbs: 78,
      fat: 0.9,
      fiber: 1.1,
      sugar: 0.2,
      salt: 0
    }
  },
  {
    name: 'Riso bianco cotto',
    per100: {
      kcal: 145,
      protein: 2.9,
      carbs: 31.8,
      fat: 0.4,
      fiber: 0.8,
      sugar: 0.2,
      salt: 0
    }
  },
  {
    name: 'Riso integrale crudo',
    per100: {
      kcal: 350,
      protein: 7,
      carbs: 71.4,
      fat: 2.8,
      fiber: 5,
      sugar: 0.7,
      salt: 0
    }
  },
  {
    name: 'Riso integrale cotto',
    per100: {
      kcal: 158,
      protein: 3.2,
      carbs: 32.6,
      fat: 1,
      fiber: 2.3,
      sugar: 0.2,
      salt: 0
    }
  },
  {
    name: 'Riso basmati crudo',
    per100: {
      kcal: 353,
      protein: 7.7,
      carbs: 77.8,
      fat: 0.8,
      fiber: 0.9,
      sugar: 0.2,
      salt: 0
    }
  },
  {
    name: 'Pasta cruda',
    per100: {
      kcal: 336,
      protein: 11.5,
      carbs: 65.8,
      fat: 1.8,
      fiber: 3,
      sugar: 2.1,
      salt: 0
    }
  },
  {
    name: 'Pasta cotta',
    per100: {
      kcal: 126,
      protein: 4,
      carbs: 25,
      fat: 0.6,
      fiber: 1.9,
      sugar: 0.6,
      salt: 0
    }
  },
  {
    name: 'Pasta integrale cotta',
    per100: {
      kcal: 128,
      protein: 4.6,
      carbs: 23.4,
      fat: 0.9,
      fiber: 3.3,
      sugar: 0.6,
      salt: 0
    }
  },
  {
    name: 'Pasta integrale cruda',
    per100: {
      kcal: 353,
      protein: 11.8,
      carbs: 67.6,
      fat: 2.2,
      fiber: 6.1,
      sugar: 1.8,
      salt: 0
    }
  },
  {
    name: 'Avena in fiocchi',
    per100: {
      kcal: 367,
      protein: 13.3,
      carbs: 57.9,
      fat: 6.5,
      fiber: 10.2,
      sugar: 1,
      salt: 0
    }
  },
  {
    name: 'Pane bianco',
    per100: {
      kcal: 287,
      protein: 8.3,
      carbs: 58.3,
      fat: 1.4,
      fiber: 2.7,
      sugar: 2.3,
      salt: 1.3
    }
  },
  {
    name: 'Pane integrale',
    per100: {
      kcal: 262,
      protein: 8.5,
      carbs: 43.7,
      fat: 4.1,
      fiber: 6.2,
      sugar: 5.7,
      salt: 1.2
    }
  },
  {
    name: 'Pane di segale',
    per100: {
      kcal: 260,
      protein: 8.3,
      carbs: 51.5,
      fat: 1,
      fiber: 4.5,
      sugar: 2.4,
      salt: 1.4
    }
  },
  {
    name: 'Fette biscottate',
    per100: {
      kcal: 409,
      protein: 9.8,
      carbs: 76.6,
      fat: 5.9,
      fiber: 3.1,
      sugar: 6.8,
      salt: 1.3
    }
  },
  {
    name: 'Farina 00',
    per100: {
      kcal: 350,
      protein: 9,
      carbs: 73.7,
      fat: 1,
      fiber: 3.2,
      sugar: 1.5,
      salt: 0.1
    }
  },
  {
    name: 'Farina integrale',
    per100: {
      kcal: 342,
      protein: 11.4,
      carbs: 64.9,
      fat: 1.5,
      fiber: 10.2,
      sugar: 1.8,
      salt: 0
    }
  },
  {
    name: 'Semola cotta',
    per100: {
      kcal: 122,
      protein: 3.4,
      carbs: 24,
      fat: 0.8,
      fiber: 1.9,
      sugar: 3,
      salt: 0
    }
  },
  {
    name: 'Orzo perlato crudo',
    per100: {
      kcal: 346,
      protein: 9.9,
      carbs: 68.6,
      fat: 1.2,
      fiber: 9.1,
      sugar: 0.8,
      salt: 0
    }
  },
  {
    name: 'Quinoa cotta',
    per100: {
      kcal: 149,
      protein: 4.7,
      carbs: 27.9,
      fat: 1.1,
      fiber: 3.8,
      sugar: 0.9,
      salt: 0
    }
  },
  {
    name: 'Mais dolce in scatola',
    per100: {
      kcal: 106,
      protein: 2.8,
      carbs: 18.4,
      fat: 1.7,
      fiber: 3.1,
      sugar: 5.2,
      salt: 0.6
    }
  },
  {
    name: 'Gallette di riso',
    per100: {
      kcal: 385,
      protein: 7.3,
      carbs: 80.5,
      fat: 3,
      fiber: 2.9,
      sugar: 0.7,
      salt: 0.2
    }
  },
  {
    name: 'Lenticchie cotte',
    per100: {
      kcal: 88,
      protein: 9,
      carbs: 12.2,
      fat: 0.4,
      fiber: 7.9,
      sugar: 1.8,
      salt: 0
    }
  },
  {
    name: 'Ceci cotti',
    per100: {
      kcal: 147,
      protein: 8.3,
      carbs: 17.7,
      fat: 3,
      fiber: 8.2,
      sugar: 0.3,
      salt: 0
    }
  },
  {
    name: 'Fagioli bianchi cotti',
    per100: {
      kcal: 112,
      protein: 6.8,
      carbs: 12,
      fat: 1.1,
      fiber: 13.8,
      sugar: 0.3,
      salt: 0
    }
  },
  {
    name: 'Fagioli rossi cotti',
    per100: {
      kcal: 116,
      protein: 9.6,
      carbs: 12.3,
      fat: 0.6,
      fiber: 11.6,
      sugar: 0.5,
      salt: 0
    }
  },
  {
    name: 'Piselli cotti',
    per100: {
      kcal: 50,
      protein: 5.8,
      carbs: 4.7,
      fat: 0.9,
      fiber: 5.8,
      sugar: 1.8,
      salt: 0
    }
  },
  {
    name: 'Tofu',
    per100: {
      kcal: 148,
      protein: 13.4,
      carbs: 2.9,
      fat: 8.5,
      fiber: 0.5,
      sugar: 0.6,
      salt: 0
    }
  },
  {
    name: 'Broccoli cotti',
    per100: {
      kcal: 20,
      protein: 2.1,
      carbs: 1.1,
      fat: 0.8,
      fiber: 1.5,
      sugar: 1.1,
      salt: 0.1
    }
  },
  {
    name: 'Spinaci cotti',
    per100: {
      kcal: 16,
      protein: 3.2,
      carbs: 0.5,
      fat: 0.1,
      fiber: 2.7,
      sugar: 0.5,
      salt: 0.1
    }
  },
  {
    name: 'Zucchine cotte',
    per100: {
      kcal: 16,
      protein: 0.9,
      carbs: 1.4,
      fat: 0.4,
      fiber: 1.5,
      sugar: 1.4,
      salt: 0.1
    }
  },
  {
    name: 'Pomodoro',
    per100: {
      kcal: 19,
      protein: 0.9,
      carbs: 2.5,
      fat: 0.3,
      fiber: 1.2,
      sugar: 2.5,
      salt: 0
    }
  },
  {
    name: 'Insalata',
    per100: {
      kcal: 12,
      protein: 1.3,
      carbs: 1.3,
      fat: 0.2,
      fiber: 1.2,
      sugar: 0.7,
      salt: 0
    }
  },
  {
    name: 'Rucola',
    per100: {
      kcal: 25,
      protein: 2.6,
      carbs: 2.1,
      fat: 0.7,
      fiber: 1.6,
      sugar: 2.1,
      salt: 0.1
    }
  },
  {
    name: 'Carote crude',
    per100: {
      kcal: 40,
      protein: 0.6,
      carbs: 7.6,
      fat: 0.5,
      fiber: 2.7,
      sugar: 6,
      salt: 0.1
    }
  },
  {
    name: 'Peperone crudo',
    per100: {
      kcal: 26,
      protein: 0.8,
      carbs: 3.4,
      fat: 0.5,
      fiber: 3.2,
      sugar: 3,
      salt: 0
    }
  },
  {
    name: 'Melanzana cotta',
    per100: {
      kcal: 25,
      protein: 1.3,
      carbs: 4.2,
      fat: 0.3,
      fiber: 4.3,
      sugar: 3.4,
      salt: 0
    }
  },
  {
    name: 'Cavolfiore cotto',
    per100: {
      kcal: 21,
      protein: 1.6,
      carbs: 1.6,
      fat: 0.5,
      fiber: 2,
      sugar: 1.6,
      salt: 0
    }
  },
  {
    name: 'Cipolla cruda',
    per100: {
      kcal: 35,
      protein: 1.1,
      carbs: 6.3,
      fat: 0.6,
      fiber: 1.7,
      sugar: 4.8,
      salt: 0.1
    }
  },
  {
    name: 'Funghi champignon',
    per100: {
      kcal: 28,
      protein: 2.6,
      carbs: 3.2,
      fat: 0.4,
      fiber: 1,
      sugar: 2.5,
      salt: 0.1
    }
  },
  {
    name: 'Asparagi cotti',
    per100: {
      kcal: 17,
      protein: 2.7,
      carbs: 0.8,
      fat: 0.3,
      fiber: 1.8,
      sugar: 0.8,
      salt: 0
    }
  },
  {
    name: 'Fagiolini cotti',
    per100: {
      kcal: 29,
      protein: 2,
      carbs: 3,
      fat: 0.2,
      fiber: 4,
      sugar: 1,
      salt: 0.4
    }
  },
  {
    name: 'Finocchio crudo',
    per100: {
      kcal: 22,
      protein: 1,
      carbs: 2.6,
      fat: 0.5,
      fiber: 2.6,
      sugar: 2.2,
      salt: 0.1
    }
  },
  {
    name: 'Sedano crudo',
    per100: {
      kcal: 18,
      protein: 0.6,
      carbs: 2.4,
      fat: 0.5,
      fiber: 2.2,
      sugar: 1.3,
      salt: 0.2
    }
  },
  {
    name: 'Cetriolo',
    per100: {
      kcal: 15,
      protein: 0.6,
      carbs: 2.2,
      fat: 0.5,
      fiber: 0.8,
      sugar: 1.8,
      salt: 0
    }
  },
  {
    name: 'Patate lesse',
    per100: {
      kcal: 81,
      protein: 2.2,
      carbs: 16.2,
      fat: 0.2,
      fiber: 1.8,
      sugar: 0.8,
      salt: 0
    }
  },
  {
    name: 'Patate al forno',
    per100: {
      kcal: 89,
      protein: 2.5,
      carbs: 18.5,
      fat: 0.1,
      fiber: 2.2,
      sugar: 1.2,
      salt: 0
    }
  },
  {
    name: 'Patata dolce cotta',
    per100: {
      kcal: 63,
      protein: 1.7,
      carbs: 12.2,
      fat: 0.2,
      fiber: 2.9,
      sugar: 6.1,
      salt: 0.1
    }
  },
  {
    name: 'Zucca cotta',
    per100: {
      kcal: 22,
      protein: 0.8,
      carbs: 4.5,
      fat: 0.1,
      fiber: 2,
      sugar: 3.1,
      salt: 0
    }
  },
  {
    name: 'Passata di pomodoro',
    per100: {
      kcal: 44,
      protein: 2.1,
      carbs: 8.5,
      fat: 0.2,
      fiber: 2.6,
      sugar: 5.5,
      salt: 0.9
    }
  },
  {
    name: 'Olive verdi',
    per100: {
      kcal: 155,
      protein: 1.3,
      carbs: 0,
      fat: 15.7,
      fiber: 3.6,
      sugar: 0,
      salt: 3.2
    }
  },
  {
    name: 'Mela',
    per100: {
      kcal: 45,
      protein: 0.3,
      carbs: 10.7,
      fat: 0.1,
      fiber: 1.3,
      sugar: 10.1,
      salt: 0
    }
  },
  {
    name: 'Banana',
    per100: {
      kcal: 91,
      protein: 1.1,
      carbs: 19.7,
      fat: 0.5,
      fiber: 2.7,
      sugar: 15.6,
      salt: 0
    }
  },
  {
    name: 'Arancia',
    per100: {
      kcal: 46,
      protein: 0.8,
      carbs: 8,
      fat: 0.5,
      fiber: 2.7,
      sugar: 7.6,
      salt: 0
    }
  },
  {
    name: 'Pera',
    per100: {
      kcal: 44,
      protein: 0.3,
      carbs: 10.4,
      fat: 0.1,
      fiber: 2.5,
      sugar: 10.4,
      salt: 0
    }
  },
  {
    name: 'Pesca',
    per100: {
      kcal: 46,
      protein: 0.7,
      carbs: 9.8,
      fat: 0.5,
      fiber: 1,
      sugar: 7.6,
      salt: 0
    }
  },
  {
    name: 'Albicocca',
    per100: {
      kcal: 46,
      protein: 0.5,
      carbs: 10.8,
      fat: 0.1,
      fiber: 3.1,
      sugar: 3.7
    }
  },
  {
    name: 'Fragole',
    per100: {
      kcal: 39,
      protein: 0.6,
      carbs: 6,
      fat: 0.5,
      fiber: 3.8,
      sugar: 5.6,
      salt: 0
    }
  },
  {
    name: 'Mirtilli',
    per100: {
      kcal: 58,
      protein: 0.9,
      carbs: 10.6,
      fat: 0.3,
      fiber: 2.4,
      sugar: 10,
      salt: 0
    }
  },
  {
    name: 'Lamponi',
    per100: {
      kcal: 49,
      protein: 1.2,
      carbs: 5.8,
      fat: 0.8,
      fiber: 4.3,
      sugar: 5.4,
      salt: 0
    }
  },
  {
    name: 'Kiwi',
    per100: {
      kcal: 61,
      protein: 0.9,
      carbs: 11,
      fat: 0.6,
      fiber: 2.4,
      sugar: 8.9,
      salt: 0
    }
  },
  {
    name: 'Ananas',
    per100: {
      kcal: 54,
      protein: 0.5,
      carbs: 11.7,
      fat: 0.5,
      fiber: 1.2,
      sugar: 10.5,
      salt: 0
    }
  },
  {
    name: 'Uva',
    per100: {
      kcal: 67,
      protein: 0.7,
      carbs: 15.7,
      fat: 0.2,
      fiber: 0.9,
      sugar: 15.5,
      salt: 0
    }
  },
  {
    name: 'Anguria',
    per100: {
      kcal: 39,
      protein: 0.7,
      carbs: 8.3,
      fat: 0.5,
      fiber: 0.5,
      sugar: 7.9,
      salt: 0
    }
  },
  {
    name: 'Melone',
    per100: {
      kcal: 28,
      protein: 0.8,
      carbs: 6,
      fat: 0.1,
      fiber: 1.4
    }
  },
  {
    name: 'Ciliegie',
    per100: {
      kcal: 34,
      protein: 1.3,
      carbs: 5.6,
      fat: 0.5,
      fiber: 1.2,
      sugar: 4.8,
      salt: 0
    }
  },
  {
    name: 'Avocado',
    per100: {
      kcal: 205,
      protein: 1.6,
      carbs: 0.8,
      fat: 20.6,
      fiber: 3.6,
      sugar: 0.4,
      salt: 0
    }
  },
  {
    name: 'Mandarino',
    per100: {
      kcal: 47,
      protein: 0.8,
      carbs: 9.2,
      fat: 0.5,
      fiber: 1.7,
      sugar: 8.6,
      salt: 0
    }
  },
  {
    name: 'Datteri secchi',
    per100: {
      kcal: 268,
      protein: 1.8,
      carbs: 64.7,
      fat: 0.3,
      fiber: 7.3,
      sugar: 64.7,
      salt: 0.1
    }
  },
  {
    name: 'Albicocche secche',
    per100: {
      kcal: 239,
      protein: 2.9,
      carbs: 59.1,
      fat: 0.5,
      fiber: 8.3,
      sugar: 34.3,
      salt: 0
    }
  },
  {
    name: 'Uvetta',
    per100: {
      kcal: 321,
      protein: 3,
      carbs: 73.2,
      fat: 0.9,
      fiber: 4.2,
      sugar: 70.3,
      salt: 0
    }
  },
  {
    name: 'Mandorle',
    per100: {
      kcal: 470,
      protein: 5,
      carbs: 73.9,
      fat: 17.2,
      fiber: 0,
      sugar: 71.9,
      salt: 0.2
    }
  },
  {
    name: 'Noci',
    per100: {
      kcal: 686,
      protein: 13.3,
      carbs: 6.9,
      fat: 67.3,
      fiber: 6.7,
      sugar: 3,
      salt: 0.1
    }
  },
  {
    name: 'Nocciole',
    per100: {
      kcal: 598,
      protein: 14.4,
      carbs: 7.2,
      fat: 56.9,
      fiber: 11.6,
      sugar: 4.9,
      salt: 0
    }
  },
  {
    name: 'Anacardi',
    per100: {
      kcal: 613,
      protein: 15.2,
      carbs: 26.7,
      fat: 49.5,
      fiber: 3.9,
      sugar: 8,
      salt: 1.2
    }
  },
  {
    name: 'Pistacchi',
    per100: {
      kcal: 575,
      protein: 18.4,
      carbs: 18.6,
      fat: 47.4,
      fiber: 10.1,
      sugar: 7.7,
      salt: 0
    }
  },
  {
    name: 'Arachidi',
    per100: {
      kcal: 602,
      protein: 22.9,
      carbs: 15,
      fat: 50,
      fiber: 8,
      sugar: 4.2,
      salt: 1.3
    }
  },
  {
    name: 'Burro di arachidi',
    per100: {
      kcal: 626,
      protein: 22.2,
      carbs: 16.1,
      fat: 52.5,
      fiber: 5,
      sugar: 10.5,
      salt: 1
    }
  },
  {
    name: 'Semi di chia',
    per100: {
      kcal: 373,
      protein: 16.5,
      carbs: 7.7,
      fat: 30.7,
      fiber: 34.4,
      salt: 0
    }
  },
  {
    name: 'Semi di lino',
    per100: {
      kcal: 437,
      protein: 20.2,
      carbs: 6.6,
      fat: 36.6,
      fiber: 27.3,
      sugar: 1.6,
      salt: 0.1
    }
  },
  {
    name: 'Semi di girasole',
    per100: {
      kcal: 625,
      protein: 21.3,
      carbs: 10.1,
      fat: 55.5,
      fiber: 6.4,
      sugar: 2.6,
      salt: 0
    }
  },
  {
    name: 'Pinoli',
    per100: {
      kcal: 665,
      protein: 13.7,
      carbs: 6.3,
      fat: 65,
      fiber: 10,
      sugar: 5.2,
      salt: 0
    }
  },
  {
    name: 'Olio extravergine di oliva',
    per100: {
      kcal: 900,
      protein: 0.5,
      carbs: 0,
      fat: 99.9,
      fiber: 0,
      sugar: 0,
      salt: 0
    },
    servingG: 10,
    servingLabel: '1 cucchiaio'
  },
  {
    name: 'Olio di semi di girasole',
    per100: {
      kcal: 901,
      protein: 0.5,
      carbs: 0,
      fat: 100,
      fiber: 0,
      sugar: 0,
      salt: 0
    }
  },
  {
    name: 'Aceto balsamico',
    per100: {
      kcal: 125,
      protein: 0.7,
      carbs: 25.8,
      fat: 0.6,
      fiber: 0.5,
      sugar: 19.1,
      salt: 0.1
    }
  },
  {
    name: 'Maionese',
    per100: {
      kcal: 693,
      protein: 1.4,
      carbs: 2.6,
      fat: 75.2,
      fiber: 0.3,
      sugar: 1,
      salt: 1.4
    }
  },
  {
    name: 'Senape',
    per100: {
      kcal: 152,
      protein: 6.9,
      carbs: 4.3,
      fat: 11.2,
      fiber: 1,
      sugar: 1.7,
      salt: 6.3
    }
  },
  {
    name: 'Miele',
    per100: {
      kcal: 329,
      protein: 0.6,
      carbs: 81.7,
      fat: 0,
      fiber: 0,
      sugar: 79.8,
      salt: 0
    }
  },
  {
    name: 'Zucchero',
    per100: {
      kcal: 399,
      protein: 0,
      carbs: 99.8,
      fat: 0,
      fiber: 0,
      sugar: 99.8,
      salt: 0
    }
  },
  {
    name: 'Cioccolato fondente 70%',
    per100: {
      kcal: 502,
      protein: 6.6,
      carbs: 42.9,
      fat: 33.8,
      fiber: 12,
      sugar: 38.3,
      salt: 0
    }
  },
  {
    name: 'Cioccolato al latte',
    per100: {
      kcal: 606,
      protein: 4.8,
      carbs: 45.5,
      fat: 45,
      fiber: 2.3,
      sugar: 44.5,
      salt: 0.3
    }
  },
  {
    name: 'Biscotti secchi',
    per100: {
      kcal: 439,
      protein: 8.1,
      carbs: 74.5,
      fat: 12.1,
      fiber: 2.3,
      sugar: 21.5,
      salt: 1.2
    }
  },
  {
    name: 'Marmellata',
    per100: {
      kcal: 307,
      protein: 6.5,
      carbs: 58,
      fat: 5.5,
      fiber: 0.6,
      sugar: 51.7,
      salt: 0.3
    }
  },
  {
    name: 'Birra',
    per100: {
      kcal: 35,
      protein: 0.5,
      carbs: 0.4,
      fat: 0.6,
      fiber: 0,
      sugar: 0.2,
      salt: 0
    }
  },
  {
    name: 'Vino rosso',
    per100: {
      kcal: 82,
      protein: 0.1,
      carbs: 2.6,
      fat: 0,
      fiber: 0,
      sugar: 0.6,
      salt: 0
    }
  },
  {
    name: 'Coca cola',
    per100: {
      kcal: 379,
      protein: 6.7,
      carbs: 75.6,
      fat: 3.3,
      fiber: 10.5,
      sugar: 67.9,
      salt: 0.2
    }
  },
  {
    name: 'Succo di arancia',
    per100: {
      kcal: 45,
      protein: 0.6,
      carbs: 9.6,
      fat: 0.1,
      fiber: 0.3,
      sugar: 9.6,
      salt: 0
    }
  },
  {
    name: 'Caffe espresso',
    per100: {
      kcal: 8,
      protein: 0.5,
      carbs: 1.2,
      fat: 0.2,
      fiber: 0.5,
      sugar: 0,
      salt: 0
    }
  }
]
