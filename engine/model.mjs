// Input order follows the CALCOLI worksheet. Select options derive from the score maps.
export const fields = [
  {
    "id": "purpose",
    "label": "Finalità della valutazione",
    "group": "Edificio",
    "type": "text"
  },
  {
    "id": "occupancy",
    "label": "Disponibilità dell'immobile",
    "group": "Edificio",
    "type": "select",
    "scores": {
      "libero": 0,
      "locato": -2
    }
  },
  {
    "id": "leaseType",
    "label": "Tipo di locazione",
    "group": "Edificio",
    "type": "select",
    "when": {
      "id": "occupancy",
      "values": [
        "locato"
      ]
    },
    "scores": {
      "locato con canone e durata liberi, locato stagionale": -0.5,
      "locato soggetto a equo canone": -1
    }
  },
  {
    "id": "leaseYears",
    "label": "Anni dall'inizio della locazione",
    "group": "Edificio",
    "type": "number",
    "min": 0,
    "step": 1,
    "when": {
      "id": "occupancy",
      "values": [
        "locato"
      ]
    },
    "scores": {
      "1": -2,
      "2": -1.5,
      "3": -1.2,
      "4": -1,
      "5": -0.5,
      "6": -0.3
    }
  },
  {
    "id": "buildingType",
    "label": "Tipologia di edificio",
    "group": "Edificio",
    "type": "text"
  },
  {
    "id": "floor",
    "label": "Piano dell'unità",
    "group": "Edificio",
    "type": "text",
    "scores": {
      "rialzato": 3
    },
    "partial": true
  },
  {
    "id": "totalFloors",
    "label": "Piani totali dell'edificio",
    "group": "Edificio",
    "type": "number",
    "min": 0,
    "step": 1
  },
  {
    "id": "singleLevel",
    "label": "L'immobile è su un unico livello?",
    "group": "Edificio",
    "type": "select",
    "scores": {
      "Sì": 1,
      "No": -0.5
    }
  },
  {
    "id": "levels",
    "label": "Numero di livelli occupati",
    "group": "Edificio",
    "type": "number",
    "min": 0,
    "step": 1,
    "when": {
      "id": "singleLevel",
      "values": [
        "No"
      ]
    },
    "scores": {
      "2": 0,
      "3": -0.3,
      "4": -0.4,
      "5": -1.2,
      "6": -3
    }
  },
  {
    "id": "levelNames",
    "label": "Quali piani occupa?",
    "group": "Edificio",
    "type": "text",
    "when": {
      "id": "singleLevel",
      "values": [
        "No"
      ]
    }
  },
  {
    "id": "architecture",
    "label": "Pregio architettonico",
    "group": "Edificio",
    "type": "select",
    "scores": {
      "protetta dai beni architettonici": 2,
      "signorile": 1.9,
      "media": 0.5,
      "popolare": -2
    }
  },
  {
    "id": "year",
    "label": "Anno di costruzione",
    "group": "Edificio",
    "type": "number",
    "min": 1,
    "step": 1,
    "max": 9999,
    "scores": {
      "1900": 0
    },
    "partial": true
  },
  {
    "id": "alarm",
    "label": "Antifurto",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": 0.3,
      "No": 0
    }
  },
  {
    "id": "centralHeating",
    "label": "Riscaldamento centralizzato",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": -0.3,
      "No": 0
    }
  },
  {
    "id": "independentHeating",
    "label": "Riscaldamento autonomo",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": 0.5,
      "No": 0
    }
  },
  {
    "id": "airConditioning",
    "label": "Aria condizionata",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": 0.3,
      "No": 0
    }
  },
  {
    "id": "intercom",
    "label": "Videocitofono",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": 0.1,
      "No": 0
    }
  },
  {
    "id": "entranceQuality",
    "label": "Ingresso dell'edificio",
    "group": "Edificio",
    "type": "select",
    "scores": {
      "Ingresso di rappresentanza in ottimo stato": 1,
      "Ingresso di medio livello": 0.5,
      "Ingresso mediocre/popolare": -0.5
    }
  },
  {
    "id": "buildingCondition",
    "label": "Manutenzione dell'edificio",
    "group": "Edificio",
    "type": "select",
    "scores": {
      "ottimo": 1,
      "richiede intervento totale": -2.5,
      "richiede intervento parziale": -1.5
    }
  },
  {
    "id": "concierge",
    "label": "Portineria",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": 0.5,
      "No": 0
    }
  },
  {
    "id": "surface",
    "label": "Superficie commerciale (m²)",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0.01,
    "step": 0.01,
    "required": true,
    "max": 100000000
  },
  {
    "id": "entrances",
    "label": "Ingressi",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.1,
      "2": 0.3,
      "3": 0.5
    }
  },
  {
    "id": "livingRooms",
    "label": "Soggiorni",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 1.5,
      "3": 2.5,
      "0": 0
    }
  },
  {
    "id": "diningRooms",
    "label": "Sale da pranzo o tinelli",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 1,
      "2": 1.5
    }
  },
  {
    "id": "combinedRooms",
    "label": "Salotti con zona pranzo",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": -0.5,
      "0": 0
    }
  },
  {
    "id": "studies",
    "label": "Studi",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 1.5,
      "0": 0
    }
  },
  {
    "id": "bedrooms",
    "label": "Camere da letto",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 0.5,
      "3": 0.5,
      "4": 1
    }
  },
  {
    "id": "bathrooms",
    "label": "Bagni",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.1,
      "2": 0.5,
      "3": 0.7,
      "4": 0.9
    }
  },
  {
    "id": "balconies",
    "label": "Terrazze e balconi",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 0.6,
      "3": 0.7,
      "4": 0.8,
      "5": 0.9,
      "0": 0
    }
  },
  {
    "id": "verandas",
    "label": "Verande",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 0.6,
      "3": 0.7,
      "4": 0.8,
      "5": 0.9
    }
  },
  {
    "id": "closets",
    "label": "Ripostigli",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 0.6,
      "3": 0.7,
      "4": 0.8,
      "5": 0.9
    }
  },
  {
    "id": "kitchens",
    "label": "Cucine abitabili",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 1,
      "2": 2
    }
  },
  {
    "id": "kitchenettes",
    "label": "Angoli cottura",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": -0.5,
      "2": -0.7,
      "0": 0
    }
  },
  {
    "id": "smallKitchens",
    "label": "Cucinotti",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.7,
      "2": 0.8,
      "0": 0
    }
  },
  {
    "id": "attics",
    "label": "Mansarde o soffitte abitabili",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 1,
      "2": 2
    }
  },
  {
    "id": "taverns",
    "label": "Taverne",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 1.5,
      "2": 2,
      "0": 0
    }
  },
  {
    "id": "cellars",
    "label": "Cantine",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 1,
      "0": 0
    }
  },
  {
    "id": "porches",
    "label": "Logge e porticati",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.5,
      "2": 0.6,
      "3": 0.7,
      "4": 0.8,
      "5": 0.9,
      "0": 0
    }
  },
  {
    "id": "laundries",
    "label": "Lavanderie",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 1,
      "2": 1.2,
      "3": 1.4,
      "0": 0
    }
  },
  {
    "id": "gardens",
    "label": "Giardini",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1
  },
  {
    "id": "lofts",
    "label": "Soffitte inabitabili",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "scores": {
      "1": 0.3,
      "2": 0.4,
      "0": 0
    }
  },
  {
    "id": "parkingSpaces",
    "label": "Posti auto",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "fallback": -1,
    "scores": {
      "1": 2,
      "2": 4,
      "3": 5
    }
  },
  {
    "id": "garages",
    "label": "Garage",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1,
    "fallback": -1,
    "scores": {
      "1": 2,
      "2": 4,
      "3": 5
    }
  },
  {
    "id": "otherRooms",
    "label": "Altri locali",
    "group": "Superfici e locali",
    "type": "number",
    "min": 0,
    "step": 1
  },
  {
    "id": "exposure",
    "label": "Esposizione dell'unità",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "da facciate opposte": 1,
      "da facciate adiacenti": 0.5,
      "da una facciata": -0.5
    }
  },
  {
    "id": "view",
    "label": "Vista dall'immobile",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Eccezionale": 2,
      "ottima": 1.5,
      "normale": 0,
      "coperta": -0.8,
      "su area degradata": -1.8
    },
    // Excel CALCOLI E54 used the misspelled key eccezzionale; same +2 as Eccezionale.
    "aliases": {
      "eccezzionale": "Eccezionale"
    }
  },
  {
    "id": "elevator",
    "label": "Ascensore",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "Sì": 1,
      "No": -1
    }
  },
  {
    "id": "layout",
    "label": "Distribuzione interna soddisfacente?",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "Sì": 1,
      "no, ridistribuzione totale": -1.9,
      "no, ridistribuzione parziale": -1.3
    }
  },
  {
    "id": "condition",
    "label": "Stato di conservazione soddisfacente?",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "Sì": 1.5,
      "no, ristrutturazione totale": -3.5,
      "no, ristrutturazione parziale": -2
    }
  },
  {
    "id": "floorRepairs",
    "label": "Pavimenti o rivestimenti da rifare",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "tutti": -3,
      "solo in parte": -1.5,
      // CALCOLI E58 stored text "1"; Excel SUM ignored it (0). Intended score is +1.
      "nessuno": 1
    }
  },
  {
    "id": "wallRepairs",
    "label": "Pareti interne da rifare",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "tutti i muri": -3.5,
      "meno del 50% dei muri": -1.6,
      "oltre il 50% dei muri": -2,
      "meno del 25% dei muri": -1.3,
      "nessun rifacimento dei muri": 1
    }
  },
  {
    "id": "bathRepairs",
    "label": "Interventi sui bagni",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "meno del 50% dei bagni": -1.2,
      "oltre il 50% dei bagni": -2.3,
      "nessun rifacimento dei bagni": 1.5,
      "solo sanitari e rubinetteria": -0.6
    }
  },
  {
    "id": "entranceDoor",
    "label": "Stato della porta d'ingresso",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "da sostituire": -0.6,
      "da revisionare": -0.2,
      // CALCOLI E61 stored +6 (typo vs peer "va bene così" rows at +1). Intended score is +1.
      "va bene così": 1
    }
  },
  {
    "id": "internalDoors",
    "label": "Stato delle porte interne",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "da sostituire": -1,
      "da revisionare": -0.5,
      "va bene così": 1
    }
  },
  {
    "id": "windows",
    "label": "Stato degli infissi esterni",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "da sostituire": -1.9,
      "da revisionare": -1,
      "va bene così": 1
    }
  },
  {
    "id": "electricity",
    "label": "Interventi sull'impianto elettrico",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "rifacimento completo": -2,
      "rifacimento parziale": -1,
      "solo prese": -0.5,
      "va bene così": 1
    }
  },
  {
    "id": "heatingRepairs",
    "label": "Interventi sull'impianto di riscaldamento",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "rifacimento totale": -2.9,
      "rifacimento radiatori": -1.8,
      "rifacimento caldaia": -1.3,
      "rifacimento tubazioni": -1.8,
      "va bene così": 1
    }
  },
  {
    "id": "floorFinish",
    "label": "Finiture dei pavimenti",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "basso livello": -1.5,
      "medio livello": 0,
      "alto livello": 2
    }
  },
  {
    "id": "wallFinish",
    "label": "Finiture delle pareti",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "intonaco civile": 0,
      "gesso": 1,
      "stucchi": 2
    }
  },
  {
    "id": "doorType",
    "label": "Tipo di porta d'ingresso",
    "group": "Manutenzione",
    "type": "select",
    "scores": {
      "semplice": -0.5,
      "blindato": 1.2
    }
  },
  {
    "id": "doorFinish",
    "label": "Finiture delle porte interne",
    "group": "Manutenzione",
    "type": "text"
  },
  {
    "id": "energyCertificate",
    "label": "Attestato energetico",
    "group": "Dotazioni",
    "type": "text"
  },
  {
    "id": "energyClass",
    "label": "Classe energetica del modello",
    "group": "Dotazioni",
    "type": "select",
    "scores": {
      "A": 2.5,
      "B": 1.8,
      "C": 1.5,
      "D": 1.2,
      "E": 1,
      "F": -0.5,
      "G": -1.2
    }
  },
  {
    "id": "zoneType",
    "label": "Caratteristica prevalente della zona",
    "group": "Zona e servizi",
    "type": "select",
    "scores": {
      "ha un'area pedonale": 1,
      "ha traffico intenso": -1,
      "ha traffico medio": -0.5,
      "ha traffico scarso": 0,
      "è in prossimità di un arteria di traffico principale": -0.5,
      "sono presenti centri aggregativi (oratori, chiese, ecc.)": 0.3
    }
  },
  {
    "id": "parkingEase",
    "label": "Parcheggio in zona",
    "group": "Zona e servizi",
    "type": "select",
    "scores": {
      "è facile trovare parcheggio": 1,
      "è molto difficile trovare parcheggio": -1,
      "Può essere difficile trovare parcheggio": -0.6
    }
  },
  {
    "id": "noise",
    "label": "Rumorosità della zona",
    "group": "Zona e servizi",
    "type": "select",
    "scores": {
      "inquinamento acustico scarso": 1,
      "inquinamento acustico medio": 0.1,
      // CALCOLI E74 stored text "-1,9"; Excel SUM ignored it (0). Intended score is -1.9.
      "inquinamento acustico intenso": -1.9
    }
  },
  {
    "id": "shops",
    "label": "Distanza a piedi dai negozi",
    "group": "Zona e servizi",
    "type": "select",
    "scores": {
      "meno di 5 minuti a piedi": 1,
      "meno di 15 minuti a piedi": 0.5,
      "oltre 15 minuti a piedi": 0.3
    }
  },
  {
    "id": "schools",
    "label": "Distanza a piedi dalle scuole",
    "group": "Zona e servizi",
    "type": "select",
    "scores": {
      "meno di 5 minuti a piedi": 1,
      "meno di 15 minuti a piedi": 0.6,
      "oltre 15 minuti a piedi": -0.3
    }
  },
  {
    "id": "parks",
    "label": "Distanza a piedi dai parchi",
    "group": "Zona e servizi",
    "type": "select",
    "scores": {
      "meno di 5 minuti a piedi": 1.3,
      "meno di 15 minuti a piedi": 0.5,
      "oltre 15 minuti a piedi": -0.2
    }
  },
];
