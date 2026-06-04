// Norske fylker og kommuner.
//
// Brukes til fylke→kommune-dropdowns i klubbregistrering og
// vikar-profil. Strukturen er { fylke: [kommune, ...] }.
// SORTED_COUNTIES gir alfabetisk fylkesliste for dropdown.
//
// Datasett: 15 fylker (etter regionreformen 2024) med totalt
// ~357 kommuner. Hentet inn manuelt — ingen ekstern kilde.

export const COUNTY_MUNICIPALITIES: Record<string, string[]> = {
  'Agder': ['Arendal', 'Birkenes', 'Bygland', 'Bykle', 'Evje og Hornnes', 'Farsund', 'Flekkefjord', 'Froland', 'Gjerstad', 'Grimstad', 'Hægebostad', 'Iveland', 'Kristiansand', 'Kvinesdal', 'Lillesand', 'Lindesnes', 'Lyngdal', 'Risør', 'Sirdal', 'Tvedestrand', 'Valle', 'Vegårshei', 'Vennesla', 'Åmli', 'Åseral'],
  'Innlandet': ['Alvdal', 'Eidskog', 'Elverum', 'Engerdal', 'Etnedal', 'Folldal', 'Gausdal', 'Gjøvik', 'Gran', 'Grue', 'Hamar', 'Kongsvinger', 'Lesja', 'Lillehammer', 'Lom', 'Lunner', 'Løten', 'Nord-Aurdal', 'Nord-Fron', 'Nord-Odal', 'Nordre Land', 'Os', 'Østre Toten', 'Øyer', 'Rendalen', 'Ringebu', 'Ringsaker', 'Sel', 'Skjåk', 'Stange', 'Stor-Elvdal', 'Sør-Aurdal', 'Sør-Fron', 'Sør-Odal', 'Tolga', 'Trysil', 'Tynset', 'Vang', 'Vestre Slidre', 'Vestre Toten', 'Våler', 'Åmot', 'Åsnes'],
  'Møre og Romsdal': ['Aukra', 'Aure', 'Averøy', 'Fjord', 'Giske', 'Gjemnes', 'Hareid', 'Herøy', 'Hustadvika', 'Kristiansund', 'Molde', 'Rauma', 'Sande', 'Smøla', 'Stranda', 'Sula', 'Sunndal', 'Surnadal', 'Sykkylven', 'Tingvoll', 'Ulstein', 'Vanylven', 'Vestnes', 'Volda', 'Ørsta', 'Ålesund'],
  'Nordland': ['Alstahaug', 'Andøy', 'Beiarn', 'Bindal', 'Bodø', 'Brønnøy', 'Bø', 'Dønna', 'Evenes', 'Fauske', 'Flakstad', 'Gildeskål', 'Grane', 'Hadsel', 'Hamarøy', 'Hemnes', 'Herøy', 'Leirfjord', 'Lurøy', 'Lødingen', 'Meløy', 'Moskenes', 'Narvik', 'Nesna', 'Rana', 'Rødøy', 'Røst', 'Saltdal', 'Sortland', 'Steigen', 'Sømna', 'Sørfold', 'Træna', 'Vefsn', 'Vega', 'Vestvågøy', 'Vevelstad', 'Værøy', 'Vågan', 'Øksnes'],
  'Oslo': ['Oslo'],
  'Rogaland': ['Bjerkreim', 'Bokn', 'Eigersund', 'Gjesdal', 'Haugesund', 'Hjelmeland', 'Hå', 'Karmøy', 'Klepp', 'Kvitsøy', 'Lund', 'Randaberg', 'Sandnes', 'Sauda', 'Sokndal', 'Sola', 'Stavanger', 'Strand', 'Suldal', 'Time', 'Tysvær', 'Utsira', 'Vindafjord'],
  'Troms': ['Bardu', 'Balsfjord', 'Dyrøy', 'Gratangen', 'Harstad', 'Ibestad', 'Karlsøy', 'Kvæfjord', 'Kvænangen', 'Kåfjord', 'Lavangen', 'Lyngen', 'Målselv', 'Nordreisa', 'Salangen', 'Senja', 'Skjervøy', 'Storfjord', 'Torsken', 'Tromsø'],
  'Trøndelag': ['Flatanger', 'Frosta', 'Grong', 'Heim', 'Hitra', 'Holtålen', 'Høylandet', 'Inderøy', 'Indre Fosen', 'Leka', 'Levanger', 'Lierne', 'Malvik', 'Melhus', 'Meråker', 'Midtre Gauldal', 'Namsos', 'Namsskogan', 'Nærøysund', 'Oppdal', 'Orkland', 'Osen', 'Overhalla', 'Rennebu', 'Rindal', 'Røros', 'Røyrvik', 'Selbu', 'Skaun', 'Snåsa', 'Steinkjer', 'Stjørdal', 'Trondheim', 'Tydal', 'Verdal', 'Åfjord'],
  'Vestfold': ['Færder', 'Holmestrand', 'Horten', 'Larvik', 'Sandefjord', 'Tønsberg'],
  'Vestland': ['Alver', 'Askvoll', 'Askøy', 'Aurland', 'Austevoll', 'Austrheim', 'Bergen', 'Bjørnafjorden', 'Bremanger', 'Eidfjord', 'Etne', 'Fedje', 'Fitjar', 'Fjaler', 'Gloppen', 'Gulen', 'Hyllestad', 'Høyanger', 'Kinn', 'Kvam', 'Kvinnherad', 'Luster', 'Lærdal', 'Masfjorden', 'Modalen', 'Osterøy', 'Samnanger', 'Sogndal', 'Solund', 'Stad', 'Stord', 'Stryn', 'Suldal', 'Sunnfjord', 'Tysnes', 'Ullensvang', 'Ulvik', 'Vaksdal', 'Vik', 'Voss', 'Øygarden', 'Årdal'],
  'Akershus': ['Asker', 'Aurskog-Høland', 'Bærum', 'Eidsvoll', 'Enebakk', 'Frogn', 'Gjerdrum', 'Hurdal', 'Lillestrøm', 'Lunner', 'Lørenskog', 'Nannestad', 'Nes', 'Nesodden', 'Nittedal', 'Nordre Follo', 'Rælingen', 'Sørum', 'Ullensaker', 'Vestby', 'Ås'],
  'Buskerud': ['Drammen', 'Flesberg', 'Flå', 'Gol', 'Hemsedal', 'Hol', 'Hole', 'Jevnaker', 'Kongsberg', 'Krødsherad', 'Lier', 'Modum', 'Nesbyen', 'Nore og Uvdal', 'Ringerike', 'Rollag', 'Sigdal', 'Øvre Eiker'],
  'Finnmark': ['Alta', 'Berlevåg', 'Båtsfjord', 'Gamvik', 'Hammerfest', 'Hasvik', 'Karasjok', 'Kautokeino', 'Lebesby', 'Loppa', 'Måsøy', 'Nesseby', 'Nordkapp', 'Porsanger', 'Sør-Varanger', 'Tana', 'Vadsø', 'Vardø'],
  'Telemark': ['Bamble', 'Drangedal', 'Fyresdal', 'Hjartdal', 'Kragerø', 'Kviteseid', 'Midt-Telemark', 'Nissedal', 'Nome', 'Notodden', 'Porsgrunn', 'Seljord', 'Siljan', 'Skien', 'Tinn', 'Tokke', 'Vinje'],
  'Østfold': ['Aremark', 'Fredrikstad', 'Halden', 'Hvaler', 'Indre Østfold', 'Marker', 'Moss', 'Rakkestad', 'Råde', 'Sarpsborg', 'Skiptvet', 'Våler'],
};

export const SORTED_COUNTIES = Object.keys(COUNTY_MUNICIPALITIES).sort();
