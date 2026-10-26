import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { rankBookBuilderCandidates } from './bookbuilder/MoveRanking';
import { scheduleMoveResult, scheduleLineResult, selectDueOwnPly } from './study/scheduling.mjs';
import { splitPgnCollection } from './study/pgn.mjs';
import { analyzeGameAgainstRepertoire } from './study/gameReview.mjs';
import { validateBackup } from './study/backup.mjs';
import { CloudSyncPanel } from './components/CloudSyncPanel';
import {
  BarChart3,
  BookOpen,
  Cpu,
  Brain,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Filter,
  Layers3,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type ExplorerMove = {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
};
type ExplorerGame = { id: string; winner?: 'white' | 'black' | null; year?: number; month?: string; players?: { white?: { name?: string; rating?: number }; black?: { name?: string; rating?: number } } };
type ExplorerResult = {
  opening?: { eco?: string; name?: string };
  white: number; draws: number; black: number; moves: ExplorerMove[]; topGames?: ExplorerGame[];
};
type CloudEval = {
  depth: number;
  knodes: number;
  pvs: Array<{ moves: string; cp?: number; mate?: number }>;
};
type Repertoire = { id: string; name: string; color: 'Wit' | 'Zwart'; createdAt: number };
type Line = {
  id: string;
  repertoireId?: string;
  name: string;
  color: 'Wit' | 'Zwart';
  moves: string;
  tags: string[];
  note: string;
  due: number;
  seen: number;
  intervalDays?: number;
};
const seed: Line[] = [
  {
    id: 'scotch',
    name: 'Schots gambiet',
    color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4',
    tags: ['Open spel', 'Actief'],
    note: 'Snel ontwikkelen en druk op f7. Na ...Nf6: e5 is vaak een belangrijk idee.',
    due: 0,
    seen: 0,
  },
  {
    id: 'scotch-main',
    name: 'Schotse hoofdvariant',
    color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4',
    tags: ['Hoofdvariant'],
    note: 'Wit krijgt snelle ontwikkeling en open lijnen. Let op ...Bc5 en ...Nf6.',
    due: 0,
    seen: 0,
  },
  {
    id: 'najdorf',
    name: 'Najdorf – hoofdstelling',
    color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    tags: ['Siciliaans', 'Scherp'],
    note: 'De ...a6-zet houdt ...e5 en ...b5 open. Kies je plan afhankelijk van de witte opstelling.',
    due: 0,
    seen: 0,
  },
  {
    id: 'sicilian',
    name: 'Siciliaans – open variant',
    color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4',
    tags: ['Tegen 1.e4'],
    note: 'Zwart accepteert asymmetrie en speelt vaak op tegenspel op de damevleugel.',
    due: 0,
    seen: 0,
  },
  {
    id: 'benoni',
    name: 'Moderne Benoni – basis',
    color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 c5 3. d5 e6',
    tags: ['Benoni', 'Tegen 1.d4'],
    note: 'Zwart geeft wit ruimte in ruil voor asymmetrisch tegenspel. Belangrijk zijn druk op e4, de halfopen e-lijn en tijdig ...b5.',
    due: 0,
    seen: 0,
  },
];
const openingMovePlans: Record<string, Array<{ move: string; plan: string }>> = {
  scotch: [
    { move: '1. e4', plan: 'Wit neemt ruimte in het centrum en opent de diagonaal voor de dame en loper.' },
    { move: '1... e5', plan: 'Zwart betwist het centrum en opent lijnen voor de eigen stukken.' },
    { move: '2. Nf3', plan: 'Ontwikkel een paard met tempo op e5; bereid d4 voor.' },
    { move: '2... Nc6', plan: 'Verdedig e5 en ontwikkel een paard naar een actief veld.' },
    { move: '3. d4', plan: 'Wit valt het centrum direct aan. Na ...exd4 krijgt wit open lijnen en snelle ontwikkeling.' },
    { move: '3... exd4', plan: 'Zwart neemt de pion; wit moet kiezen tussen direct terugnemen en gambietspel.' },
    { move: '4. Bc4', plan: 'In het Schots gambiet ontwikkelt wit met tempo richting f7 en houdt de aanval gaande. Ontwikkel snel en voorkom dat je stukken ongedekt staan.' },
  ],
  'scotch-main': [
    { move: '1. e4', plan: 'Wit claimt het centrum en maakt ontwikkeling van loper en dame mogelijk.' },
    { move: '1... e5', plan: 'Zwart bezet het centrum en maakt ruimte voor snelle ontwikkeling.' },
    { move: '2. Nf3', plan: 'Val e5 aan en ontwikkel een stuk; wit wil d4 spelen.' },
    { move: '2... Nc6', plan: 'Verdedig de e5-pion en ontwikkel richting het centrum.' },
    { move: '3. d4', plan: 'Wit opent het centrum vroeg om ruimte en activiteit te krijgen.' },
    { move: '3... exd4', plan: 'Zwart accepteert de ruil in het centrum; de e-lijn kan open komen.' },
    { move: '4. Nxd4', plan: 'Wit neemt met het paard terug, centraliseert het paard en behoudt een gezonde pionnenstructuur. Ontwikkel daarna de lopers en rokade.' },
  ],
  najdorf: [
    { move: '1. e4', plan: 'Wit neemt ruimte in het centrum en opent diagonalen voor de stukken.' },
    { move: '1... c5', plan: 'Zwart bestrijdt d4 vanaf de zijkant en kiest voor asymmetrisch tegenspel.' },
    { move: '2. Nf3', plan: 'Wit ontwikkelt en bereidt d4 voor.' },
    { move: '2... d6', plan: 'Zwart ondersteunt e5 en houdt de ontwikkeling flexibel.' },
    { move: '3. d4', plan: 'Wit opent het centrum: de typische Open Siciliaan.' },
    { move: '3... cxd4 4. Nxd4', plan: 'Zwart ruilt de c-pion tegen de d-pion; wit krijgt een centraal paard, zwart krijgt asymmetrische kansen.' },
    { move: '4... Nf6', plan: 'Ontwikkel met tempo tegen e4 en bereid verdere druk op het centrum voor.' },
    { move: '5. Nc3', plan: 'Wit verdedigt e4 en ontwikkelt een tweede paard; vaak volgen Be3, f3 of Bg5.' },
    { move: '5... a6', plan: 'De Najdorf-zet voorkomt ...Bb4 en bereidt ...e5 of ...b5 voor. Kies het plan op basis van wits opstelling; speel niet automatisch ...e5 als het paard op d4 daardoor kwetsbaar wordt.' },
  ],
  sicilian: [
    { move: '1. e4', plan: 'Wit neemt ruimte in het centrum.' },
    { move: '1... c5', plan: 'Zwart valt d4 indirect aan en creëert asymmetrische pionnenstructuren.' },
    { move: '2. Nf3', plan: 'Wit ontwikkelt en bereidt de centrale pionnenruil voor.' },
    { move: '2... Nc6', plan: 'Zwart ontwikkelt een paard en ondersteunt controle over d4.' },
    { move: '3. d4', plan: 'Wit kiest voor de Open Siciliaan en opent lijnen voor snelle activiteit.' },
    { move: '3... cxd4 4. Nxd4', plan: 'De c-pion ruilt tegen de d-pion. Wit krijgt ruimte en een sterk paard; zwart mikt op druk op de c-lijn, ...d5 of aanval op de damevleugel.' },
  ],
  'kings-indian': [
    { move: '1. d4', plan: 'Wit claimt ruimte in het centrum.' },
    { move: '1... Nf6', plan: 'Zwart ontwikkelt en houdt de keuze tussen ...g6, ...e6 en ...d5 open.' },
    { move: '2. c4', plan: 'Wit neemt extra ruimte en controleert d5.' },
    { move: '2... g6', plan: 'Zwart bereidt de fianchetto voor: de loper op g7 gaat druk op het centrum uitoefenen.' },
    { move: '3. Nc3', plan: 'Wit ondersteunt e4 en bouwt een groot centrum op.' },
    { move: '3... Bg7', plan: 'Plaats de loper op de lange diagonaal; de druk op d4 helpt later bij ...e5 of ...c5.' },
    { move: '4. e4', plan: 'Wit bezet het centrum met pionnen en neemt ruimte, maar kan later een doelwit vormen.' },
    { move: '4... d6', plan: 'Zwart ondersteunt het centrum, ontwikkelt veilig en bereidt ...e5 of ...c5 voor. Na een gesloten centrum kan zwart vaak op de koningsvleugel spelen.' },
  ],
};
const repertoireTemplates: Line[] = [
  {
    id: 'white-scotch-template', name: 'Wit — Schots: hoofdvariant', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4',
    tags: ['Wit', 'Tegen 1...e5'], note: 'Plan: ontwikkel snel, centraliseer het paard op d4, rokade en gebruik de open lijnen. Let op ...Bc5 en ...Nf6.', due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-template', name: 'Wit — Open Siciliaans', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4',
    tags: ['Wit', 'Tegen Siciliaans'], note: 'Plan: ontwikkel actief en speel vaak Nc3, Be3 en lange rokade afhankelijk van zwarts opstelling. Houd druk op d5 en zoek koningsaanval zonder de damevleugel te verwaarlozen.', due: 0, seen: 0,
  },
  {
    id: 'white-french-template', name: 'Wit — Frans: doorschuifvariant', color: 'Wit',
    moves: '1. e4 e6 2. d4 d5 3. e5',
    tags: ['Wit', 'Tegen Frans'], note: 'Plan: houd ruimte met e5, ondersteun het centrum met c3 en ontwikkel de koningsloper actief. Let op ...c5: zwart valt de basis van je pionnenketen aan.', due: 0, seen: 0,
  },
  {
    id: 'white-caro-template', name: 'Wit — Caro-Kann: doorschuifvariant', color: 'Wit',
    moves: '1. e4 c6 2. d4 d5 3. e5',
    tags: ['Wit', 'Tegen Caro-Kann'], note: 'Plan: neem ruimte, ondersteun d4 met c3 en ontwikkel rustig. Zwart zal vaak ...c5 spelen om je centrum aan te vallen.', due: 0, seen: 0,
  },
  {
    id: 'white-pirc-template', name: 'Wit — Pirc: Oostenrijkse aanval', color: 'Wit',
    moves: '1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. f4',
    tags: ['Wit', 'Tegen Pirc'], note: 'Plan: bouw een breed centrum op en bereid e5 voor. Ontwikkel met Nf3, Be2 en rokade; controleer tactieken voordat je het centrum opent.', due: 0, seen: 0,
  },
  {
    id: 'white-alapin-template', name: 'Wit — Siciliaans: Alapin', color: 'Wit',
    moves: '1. e4 c5 2. c3',
    tags: ['Wit', 'Tegen Siciliaans', 'Alapin'], note: 'Bouw met d4 een breed centrum op. Na ...d5 moet je de centrale spanning zorgvuldig behandelen; ontwikkel snel en let op tactieken op e4.', due: 0, seen: 0,
  },
  {
    id: 'white-closed-sicilian-template', name: 'Wit — Gesloten Siciliaans', color: 'Wit',
    moves: '1. e4 c5 2. Nc3',
    tags: ['Wit', 'Tegen Siciliaans', 'Gesloten'], note: 'Ontwikkel met g3, Bg2 en d3. Kies afhankelijk van zwarts opstelling tussen f4 en een rustigere opbouw; let op ...d5 als centrale tegenstoot.', due: 0, seen: 0,
  },
  {
    id: 'white-grand-prix-template', name: 'Wit — Siciliaans: Grand Prix', color: 'Wit',
    moves: '1. e4 c5 2. Nc3 Nc6 3. f4',
    tags: ['Wit', 'Tegen Siciliaans', 'Aanval'], note: 'Wit kiest voor snelle ontwikkeling en koningsvleugelruimte. Ontwikkel Nf3 en Bc4 of Bb5; speel f5 alleen wanneer het centrum en de koning veilig zijn.', due: 0, seen: 0,
  },
  {
    id: 'white-rossolimo-template', name: 'Wit — Rossolimo tegen 2...Nc6', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 Nc6 3. Bb5',
    tags: ['Wit', 'Tegen Siciliaans', 'Rossolimo'], note: 'Wit voorkomt een open Siciliaans met ...d6 en ...Nf6 in de gebruikelijke volgorde. Kies tussen Bxc6 en rustig ontwikkelen op basis van zwarts ...g6, ...e6 of ...d6.', due: 0, seen: 0,
  },
  {
    id: 'white-moscow-template', name: 'Wit — Moskou tegen 2...d6', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 d6 3. Bb5+',
    tags: ['Wit', 'Tegen Siciliaans', 'Moskou'], note: 'De schaakzet dwingt zwart tot een concrete reactie en vermijdt vaak de hoofdvarianten. Ontwikkel daarna soepel; bepaal je pionnenstructuur op basis van ...Bd7 of ...Nd7.', due: 0, seen: 0,
  },
  {
    id: 'white-smith-morra-template', name: 'Wit — Smith-Morra-gambiet', color: 'Wit',
    moves: '1. e4 c5 2. d4 cxd4 3. c3',
    tags: ['Wit', 'Tegen Siciliaans', 'Gambiet'], note: 'Wit offert een pion voor snelle ontwikkeling en open lijnen. Als zwart accepteert, ontwikkel snel en vermijd herhaalde zetten; controleer tactieken voordat je de aanval forceert.', due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-template', name: 'Zwart — Najdorf tegen 1.e4', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    tags: ['Zwart', 'Tegen 1.e4'], note: 'Plan: speel ...e5 of ...e6 afhankelijk van wits opstelling; ...b5 geeft ruimte op de damevleugel. Ontwikkel de loper en rokade pas als de koning veilig staat.', due: 0, seen: 0,
  },
  {
    id: 'black-benoni-template', name: 'Zwart — Moderne Benoni tegen 1.d4', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4 g6 7. Nf3 Bg7',
    tags: ['Zwart', 'Tegen 1.d4', 'Benoni'], note: 'Zwart geeft wit ruimte in ruil voor actief tegenspel. Speel ...Re8, zoek druk op e4 en bereid ...b5 voor wanneer de stelling het toelaat.', due: 0, seen: 0,
  },
  {
    id: 'black-english-template', name: 'Zwart — Konings-Indische opstelling tegen Engels', color: 'Zwart',
    moves: '1. c4 Nf6 2. Nc3 g6 3. e4 d6 4. d4 Bg7',
    tags: ['Zwart', 'Tegen Engels'], note: 'Plan: gebruik de fianchetto om druk op het centrum uit te oefenen. Houd ...e5 en ...c5 allebei mogelijk en voorkom dat wit ongehinderd ruimte wint.', due: 0, seen: 0,
  },
  {
    id: 'black-nf3-template', name: 'Zwart — Konings-Indisch tegen 1.Nf3', color: 'Zwart',
    moves: '1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6',
    tags: ['Zwart', 'Tegen 1.Nf3'], note: 'Plan: transponeren naar een Konings-Indische structuur. Pas op voor systemen waarin wit e4 vermijdt; ontwikkel flexibel en forceer het centrum niet.', due: 0, seen: 0,
  },
  {
    id: 'white-scotch-nf6-template', name: 'Wit — Schots tegen 4...Nf6', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. Nxc6 bxc6 7. Bd3',
    tags: ['Wit', 'Schots', 'Hoofdvariant'], note: 'Ontwikkel met tempo en bereid O-O voor. Na ...d5 moet je rekening houden met activiteit van de zwarte stukken; speel niet automatisch e5 zonder tactische controle.', due: 0, seen: 0,
  },
  {
    id: 'white-scotch-bc5-template', name: 'Wit — Schots tegen 4...Bc5', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6 6. c3',
    tags: ['Wit', 'Schots', 'Tegen ...Bc5'], note: 'Be3 ontwikkelt met tempo en ondersteunt het paard. c3 bouwt het centrum op en geeft het paard op d4 steun; ontwikkel daarna Nc2/Na3 afhankelijk van de stelling en rokade.', due: 0, seen: 0,
  },
  {
    id: 'white-scotch-gambit-nf6-template', name: 'Wit — Schots gambiet tegen 3...exd4', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. O-O Nxe4 6. Re1 d5 7. Bxd5 Qxd5 8. Nc3',
    tags: ['Wit', 'Gambiet', 'Aanval'], note: 'Je offert tijdelijk een pion voor ontwikkeling en druk op e-lijn en f7. Na ...Nxe4 is Re1 belangrijk; controleer steeds of de tactische compensatie voldoende is voordat je een pion weggeeft.', due: 0, seen: 0,
  },
  {
    id: 'white-scotch-gambit-bc5-template', name: 'Wit — Schots gambiet tegen 4...Bc5', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Bc5 5. c3 Nf6 6. e5',
    tags: ['Wit', 'Gambiet', 'Centrum'], note: 'c3 ondersteunt d4 en daagt de pion op d4 uit. e5 kan zwart terugdringen maar vraagt nauwkeurige berekening; ontwikkel snel en laat je koning niet in het centrum staan.', due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-najdorf-template', name: 'Wit — Open Siciliaans tegen Najdorf', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3',
    tags: ['Wit', 'Siciliaans', 'Najdorf'], note: 'De Engelse aanval combineert Be3, f3, Qd2 en vaak lange rokade. Bouw de aanval pas op nadat je centrum en koning veilig zijn; zwart zal vaak ...b5 en ...Nbd7 spelen.', due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-dragon-template', name: 'Wit — Open Siciliaans tegen Draak', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6',
    tags: ['Wit', 'Siciliaans', 'Draak'], note: 'Be3, f3 en Qd2 vormen de basis voor lange rokade en aanval op de koningsvleugel. Let op zwarts druk over de lange diagonaal en controleer tactieken rond ...d5.', due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-sveshnikov-template', name: 'Wit — Open Siciliaans tegen Svesjnikov', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3',
    tags: ['Wit', 'Siciliaans', 'Svesjnikov'], note: 'Na ...e5 wordt d5 een belangrijk steunpunt en kan zwart een zwakke d-pion krijgen. Het paard gaat vaak via c4 naar d5; speel positioneel en haast je niet met een aanval.', due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-alapin-template', name: 'Wit — Alapin tegen Siciliaans', color: 'Wit',
    moves: '1. e4 c5 2. c3 Nf6 3. e5 Nd5 4. d4 cxd4 5. Nf3',
    tags: ['Wit', 'Anti-Siciliaans', 'Alapin'], note: 'Wit bouwt met c3 en d4 een breed centrum. Na ...Nf6 e5 verdrijft het paard, maar let op ontwikkelingsvoorsprong en vermijd dat je te veel tempi verliest met pionnenzetten.', due: 0, seen: 0,
  },
  {
    id: 'white-french-exchange-template', name: 'Wit — Frans: ruilvariant', color: 'Wit',
    moves: '1. e4 e6 2. d4 d5 3. exd5 exd5 4. Nf3 Nf6 5. Bd3',
    tags: ['Wit', 'Tegen Frans', 'Ruilvariant'], note: 'De structuur is symmetrisch; wit probeert een klein ontwikkelingsvoordeel en ruimte te benutten. Ontwikkel rustig, rokade en vermijd ongefundeerde aanvallen in een gelijke stelling.', due: 0, seen: 0,
  },
  {
    id: 'white-french-advance-c5-template', name: 'Wit — Frans doorschuif tegen ...c5', color: 'Wit',
    moves: '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. Bd3',
    tags: ['Wit', 'Tegen Frans', 'Doorschuif'], note: 'De pionnenketen wijst naar de koningsvleugel; zwart valt de basis d4 aan met ...c5 en ...Qb6. Verdedig d4, ontwikkel snel en zoek ruimte met f4 wanneer dat veilig is.', due: 0, seen: 0,
  },
  {
    id: 'white-caro-advance-c5-template', name: 'Wit — Caro-Kann doorschuif tegen ...c5', color: 'Wit',
    moves: '1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 5. Be2 c5 6. O-O',
    tags: ['Wit', 'Tegen Caro-Kann', 'Doorschuif'], note: 'Wit houdt ruimte en ontwikkelt zonder de pionnenketen te verzwakken. Zwart zal met ...c5 de basis d4 aanvallen; bereid c3 voor als extra steun nodig is.', due: 0, seen: 0,
  },
  {
    id: 'white-scandinavian-template', name: 'Wit — Tegen Scandinavisch', color: 'Wit',
    moves: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6 6. Bc4',
    tags: ['Wit', 'Tegen Scandinavisch'], note: 'Wit ontwikkelt met tempo tegen de dame en neemt ruimte in het centrum. Ontwikkel de lopers en rokade; jaag de dame niet achterna ten koste van ontwikkeling.', due: 0, seen: 0,
  },
  {
    id: 'white-alekhine-template', name: 'Wit — Tegen Alekhine', color: 'Wit',
    moves: '1. e4 Nf6 2. e5 Nd5 3. d4 d6 4. Nf3 Bg4 5. Be2',
    tags: ['Wit', 'Tegen Alekhine'], note: 'Wit gebruikt ruimte om zwart te beperken, maar moet het centrum ondersteunen. Na ...d6 is c4 vaak een idee; voorkom dat je pionnen te ver oprukken zonder stukken te ontwikkelen.', due: 0, seen: 0,
  },
  {
    id: 'white-modern-template', name: 'Wit — Tegen Moderne verdediging', color: 'Wit',
    moves: '1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. Nf3 a6 5. Be2',
    tags: ['Wit', 'Tegen Moderne verdediging'], note: 'Neem ruimte met e4 en d4 en ontwikkel normaal. Wees voorbereid op ...c5 of ...e5; houd het centrum stevig en voorkom dat je te vroeg een flankaanval begint.', due: 0, seen: 0,
  },
  {
    id: 'white-philidor-template', name: 'Wit — Tegen Philidor', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 d6 3. d4 Nf6 4. Nc3 Nbd7 5. Bc4',
    tags: ['Wit', 'Tegen Philidor'], note: 'Wit neemt ruimte met d4 en ontwikkelt actief. Zwart is solide maar wat passief; houd druk op het centrum en ontwikkel zonder de koning in het midden te laten.', due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-be3-template', name: 'Zwart — Najdorf tegen 6.Be3', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O',
    tags: ['Zwart', 'Najdorf', 'Engelse aanval'], note: '...e5 wint ruimte en verdrijft het paard; ...Be6 en ...Be7 ontwikkelen terwijl je de koning veilig zet. Tegen lange rokade volgt vaak ...b5 en ...Rc8, met tegenspel op de damevleugel.', due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-bg5-template', name: 'Zwart — Najdorf tegen 6.Bg5', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Be7 8. Qf3 Qc7',
    tags: ['Zwart', 'Najdorf', 'Bg5'], note: '...e6 houdt het centrum flexibel en maakt ontwikkeling mogelijk. ...Be7 bereidt rokade voor; ...Qc7 ondersteunt ...b5 en houdt druk op de c-lijn. Let op witte aanvallen met e5.', due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-be2-template', name: 'Zwart — Najdorf tegen 6.Be2', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O',
    tags: ['Zwart', 'Najdorf', 'Be2'], note: '...e5 neemt ruimte en dwingt het paard naar b3. Ontwikkel met ...Be7 en ...O-O; speel daarna ...Be6, ...Nbd7 en ...Rc8 afhankelijk van wits plan.', due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-bc4-template', name: 'Zwart — Najdorf tegen 6.Bc4', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bc4 e6 7. Bb3 Be7 8. Be3 O-O',
    tags: ['Zwart', 'Najdorf', 'Bc4'], note: '...e6 maakt ...d5 op termijn mogelijk en voorkomt dat wit ongehinderd aanvalt. ...Be7 en rokade zijn belangrijk; houd de damevleugel klaar voor ...b5.', due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-f3-template', name: 'Zwart — Najdorf tegen 6.f3', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. f3 e5 7. Nb3 Be6 8. Be3 Be7',
    tags: ['Zwart', 'Najdorf', 'f3'], note: 'Na f3 ondersteunt wit e4 en bereidt het een aanval voor. ...e5 neemt ruimte; ontwikkel met ...Be6 en ...Be7 en speel ...b5 als wit lang rokeert.', due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-alapin-template', name: 'Zwart — Tegen Alapin (2.c3)', color: 'Zwart',
    moves: '1. e4 c5 2. c3 Nf6 3. e5 Nd5 4. d4 cxd4 5. Nf3 e6',
    tags: ['Zwart', 'Anti-Siciliaans', 'Alapin'], note: 'Val het centrum direct aan met ...Nf6. Na e5 gaat het paard naar d5; ruil op d4 en ontwikkel met ...e6 en ...Nc6. Wit heeft ruimte, dus zoek tegenspel tegen d4.', due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-closed-template', name: 'Zwart — Gesloten Siciliaans', color: 'Zwart',
    moves: '1. e4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6',
    tags: ['Zwart', 'Anti-Siciliaans', 'Gesloten'], note: 'Ontwikkel de lopers via fianchetto en houd het centrum flexibel. ...e6 of ...e5 en een plan met ...Rb8 en ...b5 kunnen tegenspel op de damevleugel opleveren.', due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-grandprix-template', name: 'Zwart — Tegen Grand Prix-aanval', color: 'Zwart',
    moves: '1. e4 c5 2. Nc3 Nc6 3. f4 g6 4. Nf3 Bg7 5. Bb5 Nd4',
    tags: ['Zwart', 'Anti-Siciliaans', 'Grand Prix'], note: 'Ontwikkel snel en daag de witte aanval uit voordat die op gang komt. ...Nd4 gebruikt het centrale veld en kan de loper op b5 lastigvallen; let op tactische motieven op c7 en e5.', due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-morra-template', name: 'Zwart — Tegen Morra-gambiet', color: 'Zwart',
    moves: '1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 d6',
    tags: ['Zwart', 'Anti-Siciliaans', 'Morra'], note: 'Je accepteert de gambietpion; prioriteit is ontwikkeling en koningveiligheid. Vermijd extra pionnenjacht, ontwikkel ...Nf6, ...e6 en rokade en geef wit geen gratis tempi voor aanval.', due: 0, seen: 0,
  },
  {
    id: 'black-kid-classical-template', name: 'Zwart — Konings-Indisch: klassiek centrum', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5',
    tags: ['Zwart', 'Konings-Indisch', 'Klassiek'], note: '...e5 daagt het witte centrum uit. Na d5 sluit het centrum en kan zwart vaak ...Nh5, ...f5 en koningsaanval spelen; na dxe5 kan zwart actief terugnemen. Beoordeel de centrumspanning voor je kiest.', due: 0, seen: 0,
  },
  {
    id: 'black-kid-samisch-template', name: 'Zwart — Konings-Indisch tegen Sämisch', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3 O-O 6. Be3 e5',
    tags: ['Zwart', 'Konings-Indisch', 'Sämisch'], note: 'Wit ondersteunt e4 en bereidt vaak lange rokade voor. ...e5 is de principiële centrale uitdaging; ontwikkel daarna ...Nc6 of ...c6 en zoek actief tegenspel voordat wit een aanval opbouwt.', due: 0, seen: 0,
  },
  {
    id: 'black-kid-fianchetto-template', name: 'Zwart — Konings-Indisch tegen fianchetto', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6 6. O-O Nbd7',
    tags: ['Zwart', 'Konings-Indisch', 'Fianchetto'], note: 'Wit bouwt een solide centrum zonder direct e4 te spelen. Ontwikkel rustig en kies ...e5 of ...c5 afhankelijk van wits opstelling; forceer geen koningsaanval zolang het centrum open blijft.', due: 0, seen: 0,
  },
  {
    id: 'black-kid-four-pawns-template', name: 'Zwart — Konings-Indisch tegen vierpionnenspel', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4 O-O 6. Nf3 c5',
    tags: ['Zwart', 'Konings-Indisch', 'Vierpionnenspel'], note: 'Wit neemt veel ruimte maar verzwakt de eigen stelling. ...c5 valt d4 aan; speel actief tegen het centrum en voorkom dat wit zonder weerstand e5 en f5 kan spelen.', due: 0, seen: 0,
  },
  {
    id: 'black-london-template', name: 'Zwart — Tegen Londensysteem', color: 'Zwart',
    moves: '1. d4 Nf6 2. Bf4 g6 3. e3 Bg7 4. Nf3 O-O 5. Be2 d6',
    tags: ['Zwart', 'Tegen 1.d4', 'Londensysteem'], note: 'De fianchetto geeft druk op b2 en e5. Speel ...d6 en ...Nbd7, en kies daarna ...e5 of ...c5; ontwikkel eerst en vermijd een vroeg ...Nh5 als het paard kwetsbaar wordt.', due: 0, seen: 0,
  },
  {
    id: 'black-trompowsky-template', name: 'Zwart — Tegen Trompowsky', color: 'Zwart',
    moves: '1. d4 Nf6 2. Bg5 Ne4 3. Bf4 c5 4. f3 Qa5+',
    tags: ['Zwart', 'Tegen 1.d4', 'Trompowsky'], note: '...Ne4 valt de loper aan en voorkomt dat wit ongehinderd ontwikkelt. Na Bf4 is ...c5 een centrale uitdaging; houd tactische mogelijkheden met ...Qa5+ in de gaten.', due: 0, seen: 0,
  },
  {
    id: 'black-kid-english-template', name: 'Zwart — Konings-Indisch tegen Engels', color: 'Zwart',
    moves: '1. c4 Nf6 2. Nc3 g6 3. e4 d6 4. d4 Bg7 5. Nf3 O-O',
    tags: ['Zwart', 'Tegen Engels', 'Transpositie'], note: 'Als wit e4 en d4 speelt, bereik je een Konings-Indische structuur. Als wit d4 vermijdt, blijf flexibel en speel ...d6, ...O-O en ...e5 of ...c5.', due: 0, seen: 0,
  },
  {
    id: 'black-kid-reti-template', name: 'Zwart — Tegen Réti (1.Nf3 en g3)', color: 'Zwart',
    moves: '1. Nf3 Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O 5. d3 d6',
    tags: ['Zwart', 'Tegen Réti', 'Fianchetto'], note: 'Wit kiest een flexibele fianchetto zonder direct een groot centrum te bouwen. Ontwikkel symmetrisch, speel ...e5 of ...c5 op het juiste moment en laat wit niet zonder reden d4/e4 domineren.', due: 0, seen: 0,
  },
  {
    id: 'black-queen-pawn-quiet-template', name: 'Zwart — Tegen rustige 1.d4-systemen', color: 'Zwart',
    moves: '1. d4 Nf6 2. Nf3 g6 3. e3 Bg7 4. Bd3 O-O 5. O-O d6',
    tags: ['Zwart', 'Tegen 1.d4', 'Rustige systemen'], note: 'Deze flexibele Konings-Indische opstelling voorkomt dat je te vroeg vastlegt. Reageer op c4/e4 met ...Nbd7 en ...e5 of ...c5; controleer steeds of het centrum geopend kan worden.', due: 0, seen: 0,
  },
  {
    id: 'white-scotch-nf6-deep-template', name: 'Wit — Schots tegen 4...Nf6: hoofdvariant', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. Nxc6 bxc6 7. Bd3 d5',
    tags: ['Wit', 'Schots', '4...Nf6'], note: 'De ruil op c6 geeft zwart een dubbelpion maar ook een sterk centrum. Ontwikkel met O-O en houd e4 onder controle; na ...d5 moet je de centrale spanning concreet beoordelen.',
    due: 0, seen: 0,
  },
  {
    id: 'white-scotch-bc5-deep-template', name: 'Wit — Schots tegen 4...Bc5: ontwikkelingsplan', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6 6. c3 Nge7 7. Bb5 O-O',
    tags: ['Wit', 'Schots', '4...Bc5'], note: 'Be3 ontwikkelt en valt het paard op c5 niet aan maar ondersteunt de controle over d4. c3 versterkt het centrum; ontwikkel daarna Be2 of Bd3 en rokade.',
    due: 0, seen: 0,
  },
  {
    id: 'white-scotch-qf6-template', name: 'Wit — Schots tegen 4...Qf6', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qf6 5. Nb5 Bb4+ 6. c3 Ba5 7. Be3',
    tags: ['Wit', 'Schots', 'Zijvariant'], note: 'Nb5 creëert druk op c7, maar zwart kan met ...Bb4+ tempi winnen. c3 vangt de loperroute op en Be3 ontwikkelt; controleer steeds tactieken rond c7 en e5.',
    due: 0, seen: 0,
  },
  {
    id: 'white-scotch-gambit-accepted-template', name: 'Wit — Schots gambiet: pion terugwinnen', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. O-O Nxe4 6. Re1 d5 7. Bxd5 Qxd5 8. Nc3',
    tags: ['Wit', 'Schots gambiet', 'Tactiek'], note: 'Re1 is het actieve antwoord op ...Nxe4. De stelling is tactisch: reken de varianten na en vertrouw niet alleen op ontwikkelingsvoorsprong. Wit ontwikkelt met tempo tegen de dame.',
    due: 0, seen: 0,
  },
  {
    id: 'white-scotch-gambit-bc5-deep-template', name: 'Wit — Schots gambiet tegen 4...Bc5', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Bc5 5. c3 Nf6 6. e5 d5 7. Bb5 Ne4',
    tags: ['Wit', 'Schots gambiet', '4...Bc5'], note: 'c3 daagt de pion op d4 uit; na ...Nf6 kan e5 ruimte winnen maar ook tempi kosten. Bb5 ontwikkelt met een penningachtige druk; let op zwarts tegenstoot ...d5.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-najdorf-deep-template', name: 'Wit — Najdorf: Engelse aanval tegen ...e5', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3',
    tags: ['Wit', 'Siciliaans', 'Najdorf'], note: 'De Engelse aanval combineert Be3, f3, Qd2 en vaak lange rokade. Zwart krijgt tegenspel met ...b5 en ...Be6; zorg dat je koning veilig is voordat je de pionnenstorm start.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-dragon-deep-template', name: 'Wit — Siciliaanse Draak: klassieke aanval', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. O-O-O',
    tags: ['Wit', 'Siciliaans', 'Draak'], note: 'De Yugoslavische aanval gebruikt lange rokade, h4 en g4 om de zwarte koning aan te vallen. Zwart heeft tegenkansen op de c-lijn en over de lange diagonaal; tempo is cruciaal.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-sveshnikov-deep-template', name: 'Wit — Svesjnikov: paard naar d5', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3',
    tags: ['Wit', 'Siciliaans', 'Svesjnikov'], note: 'Na ...e5 is d5 een belangrijk steunpunt en kan d6 een zwakte worden. Het paard gaat vaak via c4 naar d5; zwart krijgt ruimte en actief spel, dus speel positioneel en let op ...b5.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-classical-template', name: 'Wit — Siciliaans klassiek tegen ...Nc6 en ...Nf6', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 d6 6. Be2',
    tags: ['Wit', 'Siciliaans', 'Klassiek'], note: 'Be2 kiest voor gezonde ontwikkeling en beperkt concrete tactiek. Na O-O en Be3 of f4 kun je het centrum controleren; zwart zoekt tegenspel met ...g6, ...e6 of ...a6.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-taimanov-template', name: 'Wit — Siciliaans tegen Taimanov', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nc6 5. Nc3 Qc7 6. Be3',
    tags: ['Wit', 'Siciliaans', 'Taimanov'], note: 'Wit ontwikkelt snel en houdt e4 stevig verdedigd. Zwart speelt vaak ...a6, ...Nf6 en ...Bb4; houd de centrale velden d5 en b5 in de gaten.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-kan-template', name: 'Wit — Siciliaans tegen Kan', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 a6 5. Bd3',
    tags: ['Wit', 'Siciliaans', 'Kan'], note: 'Bd3 is een flexibele ontwikkelingszet. Wit kan c4 of O-O kiezen; zwart wil vaak ...Nf6, ...Qc7 en ...b5 spelen. Controleer of e4 en d4 voldoende ondersteund zijn.',
    due: 0, seen: 0,
  },
  {
    id: 'white-sicilian-accelerated-dragon-template', name: 'Wit — Versnelde Draak: Maroczy-bind', color: 'Wit',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. c4',
    tags: ['Wit', 'Siciliaans', 'Versnelde Draak'], note: 'c4 bouwt de Maroczy-bind op en beperkt zwarts ...d5- en ...b5-plannen. Ontwikkel met Nc3, Be2 en O-O; voorkom dat zwart zonder voorbereiding ...d5 kan spelen.',
    due: 0, seen: 0,
  },
  {
    id: 'white-french-tarrasch-template', name: 'Wit — Frans: Tarrasch-variant', color: 'Wit',
    moves: '1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5 5. Ngf3',
    tags: ['Wit', 'Tegen Frans', 'Tarrasch'], note: 'Nd2 ontwijkt de penning op c3 en houdt c3 beschikbaar. Na ...c5 moet wit beslissen of het centrum wordt geruild of gesloten; ontwikkel vlot en let op ...Nc6.',
    due: 0, seen: 0,
  },
  {
    id: 'white-french-winawer-template', name: 'Wit — Frans: Winawer tegen ...Bb4', color: 'Wit',
    moves: '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3',
    tags: ['Wit', 'Tegen Frans', 'Winawer'], note: 'Wit krijgt het loperpaar en een sterk centrum maar een beschadigde pionnenstructuur. Speel c3-c4 of Nf3 afhankelijk van de stelling en houd de koning veilig.',
    due: 0, seen: 0,
  },
  {
    id: 'white-caro-classical-template', name: 'Wit — Caro-Kann: klassieke variant', color: 'Wit',
    moves: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. Nf3',
    tags: ['Wit', 'Tegen Caro-Kann', 'Klassiek'], note: 'Wit ontwikkelt met tempo op de loper en bereidt Bd3 of h4 voor. Zwart heeft een solide structuur; gebruik ontwikkeling en ruimte in plaats van te vroeg materiaal te forceren.',
    due: 0, seen: 0,
  },
  {
    id: 'white-caro-panov-template', name: 'Wit — Caro-Kann: Panov-aanval', color: 'Wit',
    moves: '1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 Nf6 5. Nc3 e6',
    tags: ['Wit', 'Tegen Caro-Kann', 'Panov'], note: 'Wit krijgt een geïsoleerde damepionstructuur en actief stukkenspel. Gebruik open lijnen en ontwikkel snel; zwart probeert de pion te blokkeren en af te ruilen.',
    due: 0, seen: 0,
  },
  {
    id: 'white-pirc-150-attack-template', name: 'Wit — Pirc: 150-aanval', color: 'Wit',
    moves: '1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 O-O 6. O-O-O',
    tags: ['Wit', 'Tegen Pirc', '150-aanval'], note: 'Wit ontwikkelt met Be3, Qd2 en lange rokade en kan daarna h4-h5 spelen. Zwart probeert het centrum met ...c5 of ...e5 aan te vallen; zorg dat de koning veilig blijft.',
    due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-f4-template', name: 'Zwart — Najdorf tegen 6.f4', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. f4 e5 7. Nf3 Nbd7',
    tags: ['Zwart', 'Najdorf', '6.f4'], note: '...e5 neemt ruimte en dwingt wit tot een keuze met het paard. ...Nbd7 ondersteunt ...b5 en ...Bb7; controleer tactische mogelijkheden op e5 voordat je verder uitbreidt.',
    due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-g3-template', name: 'Zwart — Najdorf tegen 6.g3', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. g3 e5 7. Nde2 Be7 8. Bg2 O-O',
    tags: ['Zwart', 'Najdorf', '6.g3'], note: '...e5 neemt ruimte; na Nde2 ontwikkel je met ...Be7 en rokade. Het plan is ...Be6, ...Nbd7 en druk op de c-lijn, met oog voor wits koningsvleugel.',
    due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-h3-template', name: 'Zwart — Najdorf tegen 6.h3', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. h3 e5 7. Nde2 Be7',
    tags: ['Zwart', 'Najdorf', '6.h3'], note: '...e5 wint ruimte en voorkomt dat wit de ideale opstelling zonder concessies krijgt. Ontwikkel rustig met ...Be6, ...Nbd7 en ...O-O; speel ...b5 als de damevleugel veilig is.',
    due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-be2-deep-template', name: 'Zwart — Najdorf tegen 6.Be2: hoofdplan', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O 9. Be3 Be6',
    tags: ['Zwart', 'Najdorf', '6.Be2'], note: 'Zwart heeft ruimte gewonnen met ...e5 en ontwikkelt zonder risico. Na ...Be6 en ...Nbd7 volgen vaak ...Rc8 en ...b5; reageer op wits f4-plan met centrale controle.',
    due: 0, seen: 0,
  },
  {
    id: 'black-najdorf-bc4-deep-template', name: 'Zwart — Najdorf tegen 6.Bc4: hoofdplan', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bc4 e6 7. Bb3 Be7 8. Be3 O-O 9. O-O Nc6',
    tags: ['Zwart', 'Najdorf', '6.Bc4'], note: '...e6 voorkomt dat wit ongehinderd e5 speelt en maakt ...d5 mogelijk. Ontwikkel de koning veilig en zoek daarna ...Qc7, ...b5 of ...Nxd4 afhankelijk van de stelling.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-alapin-deep-template', name: 'Zwart — Alapin: 2.c3 dwingt centrumkeuze', color: 'Zwart',
    moves: '1. e4 c5 2. c3 Nf6 3. e5 Nd5 4. d4 cxd4 5. Nf3 e6 6. cxd4 d6',
    tags: ['Zwart', 'Anti-Siciliaans', 'Alapin'], note: 'Na e5 gaat het paard naar d5 en valt zwart het centrum aan met ...e6 en ...d6. Ruilen op d4 opent lijnen; ontwikkel snel en richt je op de witte geïsoleerde of achtergebleven pionnen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-moscow-template', name: 'Zwart — Siciliaans: Moskou-variant tegen 3.Bb5+', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 d6 3. Bb5+ Bd7 4. Bxd7+ Qxd7',
    tags: ['Zwart', 'Anti-Siciliaans', 'Moskou'], note: '...Bd7 biedt een rustige manier om de schaak te neutraliseren. Na de ruil neemt zwart terug met de dame en kan ...Nf6, ...Nc6 en ...g6 spelen; wit heeft het loperpaar ingeruild.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-rossolimo-template', name: 'Zwart — Siciliaans: Rossolimo tegen 3.Bb5', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 Nc6 3. Bb5 g6 4. O-O Bg7 5. Re1 e5',
    tags: ['Zwart', 'Anti-Siciliaans', 'Rossolimo'], note: '...g6 fianchetteert de loper en houdt de pionnenstructuur flexibel. Na O-O kan ...Bg7 en ...e5 een stevig centrum vormen; let op Bxc6 en de zwakte van d6.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-closed-deep-template', name: 'Zwart — Gesloten Siciliaans: standaardopstelling', color: 'Zwart',
    moves: '1. e4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6 6. Be3 e5',
    tags: ['Zwart', 'Anti-Siciliaans', 'Gesloten'], note: 'Zwart ontwikkelt en bouwt een centrum met ...e5. Het plan ...Be6, ...Qd7 en ...Bh3 kan de witte loper ruilen; op de damevleugel zijn ...Rb8 en ...b5 gebruikelijke uitbreidingen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-classical-deep-template', name: 'Zwart — Konings-Indisch klassiek: gesloten centrum', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7',
    tags: ['Zwart', 'Konings-Indisch', 'Klassiek'], note: 'Na d5 sluit het centrum en verhuist het paard vaak naar e7-g6 of c8. Zwart bouwt ...f5 voor koningsaanval; wit zoekt ruimte op de damevleugel met c5 of b4.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-mar-del-plata-template', name: 'Zwart — Konings-Indisch: Mar del Plata-plan', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7',
    tags: ['Zwart', 'Konings-Indisch', 'Mar del Plata'], note: 'Het plan is ...f5-f4 en druk op de witte koning. De manoeuvre ...Ne7-d7 ondersteunt ...f5; onderschat wits damevleugelspel met c5 en b4 niet.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-samisch-deep-template', name: 'Zwart — Konings-Indisch tegen Sämisch: centrumdruk', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3 O-O 6. Be3 e5 7. d5 Nh5',
    tags: ['Zwart', 'Konings-Indisch', 'Sämisch'], note: 'Wit ondersteunt het centrum en kan lang rokeren. ...e5 daagt d4 uit; na d5 zoekt zwart ruimte voor ...f5 en kan het paard naar f4 of g3 springen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-four-pawns-deep-template', name: 'Zwart — Konings-Indisch tegen vierpionnenspel: ...c5', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4 O-O 6. Nf3 c5 7. d5 e6',
    tags: ['Zwart', 'Konings-Indisch', 'Vierpionnenspel'], note: '...c5 valt d4 aan en verhindert dat wit onbeperkt uitbreidt. Na d5 kan ...e6 de keten aanvallen; zwart moet actief spelen omdat wit veel ruimte heeft.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-fianchetto-deep-template', name: 'Zwart — Konings-Indisch tegen fianchetto: ...c5', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 g6 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6 6. O-O c5',
    tags: ['Zwart', 'Konings-Indisch', 'Fianchetto'], note: '...c5 is een principiële aanval op d4. Na d5 kan zwart ...e6 of ...b5 voorbereiden; na dxc5 kan zwart met ...dxc5 terugnemen en een solide centrum houden.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-london-deep-template', name: 'Zwart — Tegen Londensysteem: ...c5', color: 'Zwart',
    moves: '1. d4 Nf6 2. Bf4 g6 3. e3 Bg7 4. Nf3 O-O 5. Be2 d6 6. O-O c5',
    tags: ['Zwart', 'Tegen 1.d4', 'Londen'], note: '...c5 valt het centrum direct aan en voorkomt een comfortabele opbouw met c3 en e3. Na c3 kan zwart ...Nc6 of ...Qb6 overwegen; controleer altijd b2 en d4.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-queen-pawn-template', name: 'Zwart — Konings-Indisch tegen 1.d4 en 2.Nf3', color: 'Zwart',
    moves: '1. d4 Nf6 2. Nf3 g6 3. c4 Bg7 4. Nc3 O-O 5. e4 d6',
    tags: ['Zwart', 'Konings-Indisch', 'Zetvolgorde'], note: 'De zetvolgorde blijft flexibel zolang wit nog geen Nc3 speelt. Na e4 is ...d6 de gebruikelijke voorbereiding op ...e5; houd ook ...c5 in reserve als wit het centrum anders opbouwt.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-english-deep-template', name: 'Zwart — Engels: transpositie naar Konings-Indisch', color: 'Zwart',
    moves: '1. c4 Nf6 2. Nc3 g6 3. e4 d6 4. d4 Bg7 5. Nf3 O-O 6. Be2 e5',
    tags: ['Zwart', 'Tegen Engels', 'Transpositie'], note: 'Wit heeft naar een Konings-Indische structuur getransponeerd. Speel ...e5 en beoordeel of d5 de beste reactie is; bij een gesloten centrum komt het plan ...Nh5 en ...f5 vaak in beeld.',
    due: 0, seen: 0,
  },
  {
    id: 'black-kid-reti-deep-template', name: 'Zwart — Réti: flexibel met ...d6 en ...e5', color: 'Zwart',
    moves: '1. Nf3 Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O 5. d3 d6 6. e4 e5',
    tags: ['Zwart', 'Tegen Réti', 'Fianchetto'], note: 'Zwart spiegelt wits ontwikkeling en bezet het centrum wanneer wit e4 speelt. Als wit d4 voorbereidt, overweeg ...c5; speel niet automatisch ...e5 wanneer het centrum tactisch open kan gaan.',
    due: 0, seen: 0,
  },
  {
    id: 'black-vs-queens-gambit-template', name: 'Zwart — Tegen Damegambiet: ...d5 en ...e6', color: 'Zwart',
    moves: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bg5 O-O',
    tags: ['Zwart', 'Tegen 1.d4', 'Damegambiet geweigerd'], note: 'Dit is een solide alternatief wanneer je niet naar het Konings-Indisch wilt transponeren. Zwart ontwikkelt klassiek, ondersteunt d5 en kan later ...c5 of ...dxc4 spelen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-vs-slav-template', name: 'Zwart — Tegen Slavisch: ...d5 en ...c6', color: 'Zwart',
    moves: '1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4',
    tags: ['Zwart', 'Tegen 1.d4', 'Slavisch'], note: 'De Slavische structuur ondersteunt d5 met de c-pion. Na ...dxc4 probeert zwart de pion tijdelijk vast te houden met ...b5 of terug te geven voor ontwikkeling; wit krijgt ruimte.',
    due: 0, seen: 0,
  },
  {
    id: 'black-vs-english-symmetrical-template', name: 'Zwart — Engels: symmetrische variant', color: 'Zwart',
    moves: '1. c4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7',
    tags: ['Zwart', 'Tegen Engels', 'Symmetrisch'], note: 'De symmetrische opstelling houdt de centrumkeuzes open. Zwart kan ...e6, ...e5 of ...Nf6 spelen; let op transposities naar een Siciliaanse of Konings-Indische structuur.',
    due: 0, seen: 0,
  },
  {
    id: 'black-vs-bird-template', name: 'Zwart — Tegen Bird-opening', color: 'Zwart',
    moves: '1. f4 d5 2. Nf3 Nf6 3. e3 g6 4. b3 Bg7',
    tags: ['Zwart', 'Tegen flankopening', 'Bird'], note: 'Bezet het centrum met ...d5 en ontwikkel normaal. De loper op g7 zet druk op het centrum; overweeg ...O-O en ...c5 en wees alert op witte koningsaanval.',
    due: 0, seen: 0,
  },
  {
    id: 'black-vs-dutch-template', name: 'Zwart — Tegen Nederlandse opening', color: 'Zwart',
    moves: '1. d4 f5 2. g3 Nf6 3. Bg2 e6 4. Nf3 Be7',
    tags: ['Zwart', 'Tegen flankopening', 'Nederlands'], note: 'Wit heeft gekozen voor een flankopstelling; zwart bouwt een flexibel centrum op. Ontwikkel, rokade en speel ...d5 of ...c5 afhankelijk van wits opstelling.',
    due: 0, seen: 0,
  },
  {
    id: 'white-italian-giuoco-template', name: 'Wit — Italiaans: Giuoco Piano', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4',
    tags: ['Wit', 'Italiaans', 'Giuoco Piano'], note: 'Wit bouwt met c3 en d4 een centraal pionnenpaar op. Na ...Bb4+ is Nc3 een belangrijke verdediging; ken de tactiek rond e4 en ontwikkel daarna snel.',
    due: 0, seen: 0,
  },
  {
    id: 'white-italian-pianissimo-template', name: 'Wit — Italiaans: Pianissimo', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. O-O d6 6. c3 O-O 7. Re1',
    tags: ['Wit', 'Italiaans', 'Pianissimo'], note: 'Wit kiest voor manoeuvreren in plaats van direct d4. Re1 ondersteunt e4-e5; speel h3, Nbd2-f1-g3 en bereid d4 voor op het juiste moment.',
    due: 0, seen: 0,
  },
  {
    id: 'white-italian-two-knights-template', name: 'Wit — Italiaans: Twee Paardenspel', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Be2',
    tags: ['Wit', 'Italiaans', 'Twee Paardenspel'], note: 'Ng5 zet druk op f7 maar zwart countert met ...d5. Na ...Na5 is de loper terugtrekken vaak het praktische plan; wit moet ontwikkeling en koningveiligheid boven pionnenjacht stellen.',
    due: 0, seen: 0,
  },
  {
    id: 'white-italian-evans-template', name: 'Wit — Italiaans: Evans-gambiet', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O',
    tags: ['Wit', 'Italiaans', 'Evans-gambiet'], note: 'Wit offert de b-pion voor tempi en een breed centrum. Speel actief met c3 en d4; als zwart materiaal probeert vast te houden, gebruik de ontwikkelingsvoorsprong.',
    due: 0, seen: 0,
  },
  {
    id: 'white-spanish-morphy-template', name: 'Wit — Spaans: Morphy-verdediging', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6',
    tags: ['Wit', 'Spaans', 'Morphy'], note: 'Wit houdt druk op e5 en bereidt c3-d4 voor. Zwart ontwikkelt solide; speel niet automatisch d4 zonder rekening te houden met ...exd4 en de positie van het paard op c6.',
    due: 0, seen: 0,
  },
  {
    id: 'white-spanish-berlin-template', name: 'Wit — Spaans: Berlijnse verdediging', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5',
    tags: ['Wit', 'Spaans', 'Berlijn'], note: 'Zwart kiest een concrete, solide lijn en accepteert een vroege ruil. Wit moet de activiteit van de stukken benutten; zwart vertrouwt op structuur en eindspelvaardigheid.',
    due: 0, seen: 0,
  },
  {
    id: 'white-spanish-exchange-template', name: 'Wit — Spaans: ruilvariant', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O Bg4 6. h3 Bh5',
    tags: ['Wit', 'Spaans', 'Ruilvariant'], note: 'Wit geeft de loper voor het paard en mikt op een gunstige pionnenstructuur en eindspel. Zwart heeft het loperpaar; wit moet activiteit gebruiken en niet te vroeg alles afruilen.',
    due: 0, seen: 0,
  },
  {
    id: 'white-spanish-marshall-template', name: 'Wit — Spaans: Marshall-aanval', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. c3 d5',
    tags: ['Wit', 'Spaans', 'Marshall'], note: 'Zwart offert vaak een pion voor initiatief met ...d5. Wit moet de tactische hoofdvarianten kennen en niet alleen materiaal tellen; ontwikkeling en koningveiligheid zijn cruciaal.',
    due: 0, seen: 0,
  },
  {
    id: 'white-spanish-open-template', name: 'Wit — Spaans: open variant', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4 6. d4 b5 7. Bb3 d5',
    tags: ['Wit', 'Spaans', 'Open variant'], note: 'Zwart neemt op e4 en probeert het centrum met ...d5 en ...b5 te controleren. Wit krijgt dynamische kansen; ontwikkel met tempo en let op de tactische kwetsbaarheid van e4 en c6.',
    due: 0, seen: 0,
  },
  {
    id: 'white-scotch-mieses-template', name: 'Wit — Schots: Mieses-variant', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. Nxc6 bxc6 7. Bd3 d5',
    tags: ['Wit', 'Schots', 'Mieses'], note: 'Zwart geeft wit het loperpaar maar krijgt een actief centrum met ...d5. Wit moet snel rokeren en druk op de open lijnen houden; de centrumspanning is het strategische thema.',
    due: 0, seen: 0,
  },
  {
    id: 'white-scotch-gambit-deep-template', name: 'Wit — Schots gambiet: hoofdplan', color: 'Wit',
    moves: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. O-O Nxe4 6. Re1 d5 7. Bxd5 Qxd5 8. Nc3',
    tags: ['Wit', 'Schots gambiet', 'Tactiek'], note: 'Het gambiet draait om ontwikkeling en druk op de e-lijn. Na ...Nxe4 is Re1 een principiële zet; ken de tactische motieven en speel niet alleen op snelle aanval.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-scheveningen-template', name: 'Zwart — Siciliaans: Scheveningen', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 d6 6. Be3 a6 7. f3 Be7 8. Qd2 O-O',
    tags: ['Zwart', 'Siciliaans', 'Scheveningen'], note: 'De pionnen op e6 en d6 vormen een flexibel centrum. Ontwikkel met ...Be7 en ...O-O; speel later ...b5 of ...d5 als de tactiek klopt. Tegen lange rokade moet zwart snel tegenspel zoeken.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-classical-template', name: 'Zwart — Siciliaans: klassieke variant', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 d6 6. Be2 e6 7. O-O Be7',
    tags: ['Zwart', 'Siciliaans', 'Klassiek'], note: 'Zwart ontwikkelt de paarden voor de lopers en bouwt een solide centrum. Typische plannen zijn ...O-O, ...Be6 en ...Rc8; controleer of ...d5 tactisch mogelijk is voordat je het speelt.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-sveshnikov-deep-template', name: 'Zwart — Siciliaans: Sveshnikov', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5',
    tags: ['Zwart', 'Siciliaans', 'Sveshnikov'], note: '...e5 geeft ruimte maar laat d5 als zwak veld achter. Zwart compenseert met activiteit en ...b5-b4; wit probeert d5 te blokkeren. Begrijp de velden en pionnenstructuur, niet alleen de zetten.',
    due: 0, seen: 0,
  },
  {
    id: 'black-sicilian-taimanov-template', name: 'Zwart — Siciliaans: Taimanov', color: 'Zwart',
    moves: '1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nc6 5. Nc3 Qc7 6. Be3 a6',
    tags: ['Zwart', 'Siciliaans', 'Taimanov'], note: 'De Taimanov houdt ...d6 en ...d5 allebei mogelijk. Ontwikkel met ...Nf6 en ...Bb4 of ...Be7; de dame op c7 ondersteunt e5 en controleert de c-lijn.',
    due: 0, seen: 0,
  },
  {
    id: 'black-scandinavian-qa5-template', name: 'Zwart — Scandinavisch: dame naar a5', color: 'Zwart',
    moves: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5',
    tags: ['Zwart', 'Scandinavisch', 'Qa5'], note: 'De dame staat actief op a5 en zwart bouwt met ...c6 en ...Bf5 een solide structuur. Ontwikkel vlot en vermijd meerdere damezetten; wit zal vaak met c4 ruimte winnen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-scandinavian-qd6-template', name: 'Zwart — Scandinavisch: dame naar d6', color: 'Zwart',
    moves: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd6 4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5',
    tags: ['Zwart', 'Scandinavisch', 'Qd6'], note: 'Qd6 ondersteunt e5 en houdt de dame uit sommige tempi. De prioriteiten zijn ...Bf5 of ...Bg4, ...c6, ...Nbd7 en rokade; bewaak de dame tegen tempozetten.',
    due: 0, seen: 0,
  },
  {
    id: 'black-scandinavian-modern-template', name: 'Zwart — Scandinavisch: moderne variant', color: 'Zwart',
    moves: '1. e4 d5 2. exd5 Nf6 3. d4 Nxd5 4. Nf3 g6 5. c4 Nb6 6. Nc3 Bg7',
    tags: ['Zwart', 'Scandinavisch', 'Modern'], note: 'Zwart laat de dame op haar beginveld en haalt de pion met het paard terug. De prijs is tempi en ruimte voor wit; ontwikkel actief en zet de loper op g7 tegen het centrum.',
    due: 0, seen: 0,
  },
  {
    id: 'black-scandinavian-qd8-template', name: 'Zwart — Scandinavisch: dame terug naar d8', color: 'Zwart',
    moves: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd8 4. d4 Nf6 5. Nf3 c6',
    tags: ['Zwart', 'Scandinavisch', 'Qd8'], note: 'Zwart kiest voor een veilige terugtocht van de dame en ontwikkelt daarna normaal. Wit heeft tempi gewonnen; compenseer met ...Bf5, ...e6 en snelle ontwikkeling.',
    due: 0, seen: 0,
  },
  {
    id: 'black-benoni-modern-template', name: 'Zwart — Moderne Benoni: hoofdvariant', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4 g6 7. Nf3 Bg7',
    tags: ['Zwart', 'Benoni', 'Modern'], note: 'Zwart accepteert ruimteachterstand voor asymmetrisch tegenspel. De druk op e4 en de halfopen e-lijn zijn belangrijk; ...Re8, ...Na6-c7 en ...b5 zijn typische plannen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-benoni-czech-template', name: 'Zwart — Tsjechische Benoni', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 c5 3. d5 e5 4. Nc3 d6 5. e4 Be7 6. Nf3 O-O',
    tags: ['Zwart', 'Benoni', 'Tsjechisch'], note: 'Met ...e5 sluit zwart het centrum en kiest voor een compact systeem. Wit heeft meer ruimte, maar zwart kan manoeuvreren met ...Ne8, ...g6 of ...f5 afhankelijk van wits opstelling.',
    due: 0, seen: 0,
  },
  {
    id: 'black-benoni-four-pawns-template', name: 'Zwart — Benoni: vierpionnenspel', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4 g6 7. f4 Bg7',
    tags: ['Zwart', 'Benoni', 'Vierpionnenspel'], note: 'Wit bouwt een maximaal centrum op. Zwart moet dit met ...O-O, ...Re8 en druk op e4 bestrijden; wacht niet te lang met tegenspel.',
    due: 0, seen: 0,
  },
  {
    id: 'black-benoni-fianchetto-template', name: 'Zwart — Benoni: fianchetto-opstelling', color: 'Zwart',
    moves: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nf3 exd5 5. cxd5 d6 6. Nc3 g6 7. g3 Bg7',
    tags: ['Zwart', 'Benoni', 'Fianchetto'], note: 'De fianchetto geeft zwart langdurige druk op het centrum en een veilige koning. Zoek ...O-O, ...Re8 en eventueel ...Na6-c7; wit kan met e4 en Bg2 een stevig centrum krijgen.',
    due: 0, seen: 0,
  },
  {
    id: 'black-petroff-main-template', name: 'Zwart — Petroff: hoofdvariant', color: 'Zwart',
    moves: '1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4 d5 6. Bd3 Be7 7. O-O Nc6',
    tags: ['Zwart', 'Petroff', 'Hoofdvariant'], note: 'De Petroff neutraliseert de aanval op e5 door direct op e4 te counteren. Zwart moet de pionnenstructuur in balans houden en snel ontwikkelen; na d4 is ...d5 de belangrijkste centrale reactie.',
    due: 0, seen: 0,
  },
  {
    id: 'black-petroff-3d4-template', name: 'Zwart — Petroff: wit speelt 3.d4', color: 'Zwart',
    moves: '1. e4 e5 2. Nf3 Nf6 3. d4 Nxe4 4. Bd3 d5 5. Nxe5 Bd6 6. O-O O-O',
    tags: ['Zwart', 'Petroff', '3.d4'], note: 'Zwart neemt op e4 en bezet daarna het centrum met ...d5. Na Nxe5 ontwikkel je met ...Bd6 en rokade; houd de druk op e5 en speel actief.',
    due: 0, seen: 0,
  },
  {
    id: 'black-petroff-structure-template', name: 'Zwart — Petroff: centrale structuur', color: 'Zwart',
    moves: '1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4 d5 6. Bd3 Bd6',
    tags: ['Zwart', 'Petroff', 'Structuur'], note: '...d5 is de principiële reactie die het centrum stabiliseert. ...Bd6 ontwikkelt actief; let op ruilen op e4 en op tactische penningen.',
    due: 0, seen: 0,
  },
];
const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const pieceGlyph: Record<string, string> = {
  wk: '♔',
  wq: '♕',
  wr: '♖',
  wb: '♗',
  wn: '♘',
  wp: '♙',
  bk: '♚',
  bq: '♛',
  br: '♜',
  bb: '♝',
  bn: '♞',
  bp: '♟',
};
function newGame(moves?: string) {
  const game = new Chess();
  if (moves) {
    try {
      game.loadPgn(moves);
    } catch {
      /* show a fresh board if the saved notation is incomplete */
    }
  }
  return game;
}

// Clone the complete move history, not just the current FEN. Loading only FEN
// discards earlier moves and makes saved variants/undo contain only the last move.
function cloneGame(source: Chess) {
  const copy = new Chess();
  const pgn = source.pgn();
  if (pgn.trim()) {
    try { copy.loadPgn(pgn); return copy; } catch { /* use FEN fallback */ }
  }
  copy.load(source.fen());
  return copy;
}
function positionSignature(game: Chess) { return game.fen().split(' ').slice(0, 4).join(' '); }
function analyzeTranspositions(lines: Line[]) {
  const positions = new Map<string, { histories: Set<string>; names: Set<string>; ply: number }>();
  for (const line of lines) {
    try {
      const game = new Chess(); const history: string[] = [];
      for (const move of newGame(line.moves).history({ verbose: true })) {
        game.move(move.san); history.push(move.san);
        const key = positionSignature(game);
        const item = positions.get(key) ?? { histories: new Set<string>(), names: new Set<string>(), ply: history.length };
        item.histories.add(history.join(' ')); item.names.add(line.name); item.ply = Math.min(item.ply, history.length); positions.set(key, item);
      }
    } catch { /* skip invalid legacy PGNs */ }
  }
  return [...positions.entries()].filter(([, item]) => item.histories.size > 1)
    .map(([fen, item]) => ({ fen, paths: item.histories.size, names: [...item.names], ply: item.ply }))
    .sort((a, b) => b.names.length - a.names.length || a.ply - b.ply).slice(0, 20);
}
function parseStrictPgn(pgn: string): Chess {
  const game = new Chess();
  game.loadPgn(pgn);
  if (game.history().length === 0) throw new Error('De PGN bevat geen zetten.');
  return game;
}


function App() {
  const [lines, setLines] = useState<Line[]>(() => {
    try {
      const saved = localStorage.getItem('repertoirelab-lines-v1');
      const parsed = saved ? (JSON.parse(saved) as Line[]) : [];
      // Remove bundled example lines from older versions; keep only user-created lines.
      return parsed.filter(line =>
        !['scotch', 'scotch-main', 'najdorf', 'sicilian', 'benoni'].includes(line.id) &&
        !line.id.endsWith('-template') &&
        !line.tags?.includes('Ingebouwde basislijn')
      );
    } catch {
      return [];
    }
  });
  const [active, setActive] = useState('');
  const [repertoires, setRepertoires] = useState<Repertoire[]>(() => {
    try { const saved = localStorage.getItem('repertoirelab-repertoires-v1'); return saved ? JSON.parse(saved) as Repertoire[] : []; } catch { return []; }
  });
  const [activeRepertoireId, setActiveRepertoireId] = useState(() => localStorage.getItem('repertoirelab-active-repertoire-v1') ?? '');
  const [newRepertoireName, setNewRepertoireName] = useState('');
  const [editingRepertoireName, setEditingRepertoireName] = useState('');
  const [editingVariantName, setEditingVariantName] = useState('');

  const [tab, setTab] = useState<'overzicht' | 'repertoire' | 'trainen'>(
    'overzicht'
  );
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<'Alles' | 'Wit' | 'Zwart'>(
    'Alles'
  );
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<'Wit' | 'Zwart'>('Wit');
  const [newMoves, setNewMoves] = useState('');
  const [newNote, setNewNote] = useState('');
  const [branchName, setBranchName] = useState('');
  const [game, setGame] = useState(() => newGame());
  const [fenInput, setFenInput] = useState('');
  const [selected, setSelected] = useState<Square | null>(null);
  const [notice, setNotice] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dueIds, setDueIds] = useState<string[]>([]);
  const [flip, setFlip] = useState(false);
  const [pgnInput, setPgnInput] = useState('');
  const [pgnColor, setPgnColor] = useState<'Wit' | 'Zwart'>('Wit');
  const [showPgn, setShowPgn] = useState(false);
  const [explorer, setExplorer] = useState<ExplorerResult | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [explorerFen, setExplorerFen] = useState('');
  const [explorerSource, setExplorerSource] = useState<'masters' | 'lichess'>('lichess');
  const [ratingBand, setRatingBand] = useState('1800');
  const [explorerToken, setExplorerToken] = useState(() => localStorage.getItem('repertoirelab-lichess-token-v1') ?? '');
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [gameUsername, setGameUsername] = useState('');
  const [gameReviewLoading, setGameReviewLoading] = useState(false);
  const [gameReview, setGameReview] = useState<string[]>([]);
  const [chessComUsername, setChessComUsername] = useState('');
  const [chessComReviewLoading, setChessComReviewLoading] = useState(false);
  const [chessComReview, setChessComReview] = useState<string[]>([]);
  const [moveInput, setMoveInput] = useState('');
  const [evalResult, setEvalResult] = useState<CloudEval | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState('');
  const [evalFen, setEvalFen] = useState('');
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [positionGoal, setPositionGoal] = useState(() => {
    const saved = Number(localStorage.getItem('repertoirelab-position-goal-v1'));
    return Number.isFinite(saved) && saved >= 1 ? saved : 1000;
  });
  const [coverage, setCoverage] = useState<Record<string, { games: number; error?: string }>>({});
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [qualityAudit, setQualityAudit] = useState<{ lineId: string; lineName: string; ply: number; san: string; severity: 'high' | 'medium'; message: string; games: number }[]>([]);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityAuditDone, setQualityAuditDone] = useState(false);
  const [showTranspositions, setShowTranspositions] = useState(false);
  const [showModelGames, setShowModelGames] = useState(true);
  const [missedMoves, setMissedMoves] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('repertoirelab-missed-moves-v1') ?? '{}') as Record<string, number>; } catch { return {}; }
  });
  const [showOpeningIdeas, setShowOpeningIdeas] = useState(true);
  const [trainingPly, setTrainingPly] = useState(0);
  const [trainingInput, setTrainingInput] = useState('');
  const [trainingFeedback, setTrainingFeedback] = useState('');
  const [trainingComplete, setTrainingComplete] = useState(false);
  const [trainingBoardFen, setTrainingBoardFen] = useState('start');
  const [trainingSelected, setTrainingSelected] = useState<Square | null>(null);
  const [trainingBoardFlip, setTrainingBoardFlip] = useState(false);
  const [moveMemory, setMoveMemory] = useState<Record<string, { seen: number; misses: number; due: number; intervalDays: number; lastResult?: 'good' | 'miss' }>>(() => { try { return JSON.parse(localStorage.getItem('repertoirelab-move-memory-v1') ?? '{}'); } catch { return {}; } });
  const [trainingEval, setTrainingEval] = useState<CloudEval | null>(null);
  const [trainingEvalLoading, setTrainingEvalLoading] = useState(false);
  const [trainingEvalError, setTrainingEvalError] = useState('');
  const [trainingAnalysisDepth, setTrainingAnalysisDepth] = useState(16);

  useEffect(() => {
    localStorage.setItem('repertoirelab-lines-v1', JSON.stringify(lines));
  }, [lines]);
  useEffect(() => { localStorage.setItem('repertoirelab-repertoires-v1', JSON.stringify(repertoires)); }, [repertoires]);
  useEffect(() => {
    if (repertoires.length || !lines.length) return;
    const migrated: Repertoire[] = [];
    for (const color of ['Wit', 'Zwart'] as const) {
      if (lines.some(line => line.color === color)) migrated.push({ id: 'migrated-' + color.toLowerCase(), name: 'Geïmporteerd repertoire ' + color.toLowerCase(), color, createdAt: Date.now() });
    }
    if (migrated.length) {
      setRepertoires(migrated);
      setLines(previous => previous.map(line => ({ ...line, repertoireId: line.repertoireId ?? 'migrated-' + line.color.toLowerCase() })));
      setActiveRepertoireId(migrated[0].id);
    }
  }, [repertoires.length, lines.length]);

  useEffect(() => { localStorage.setItem('repertoirelab-active-repertoire-v1', activeRepertoireId); }, [activeRepertoireId]);

  useEffect(() => {
    localStorage.setItem('repertoirelab-position-goal-v1', String(positionGoal));
  }, [positionGoal]);
  useEffect(() => {
    localStorage.setItem('repertoirelab-missed-moves-v1', JSON.stringify(missedMoves));
  }, [missedMoves]);
  useEffect(() => { localStorage.setItem('repertoirelab-move-memory-v1', JSON.stringify(moveMemory)); }, [moveMemory]);
  useEffect(() => {
    if (explorerToken.trim()) localStorage.setItem('repertoirelab-lichess-token-v1', explorerToken.trim());
    else localStorage.removeItem('repertoirelab-lichess-token-v1');
  }, [explorerToken]);
  // Keep the study board available even before the first user-created line exists.
  // The draft is UI state only; it is not saved as a pre-installed repertoire.
  const activeRepertoire = repertoires.find(item => item.id === activeRepertoireId) ?? null;
  const repertoireLines = activeRepertoireId ? lines.filter(line => line.repertoireId === activeRepertoireId) : [];
  const current = repertoireLines.find(line => line.id === active) ?? repertoireLines[0] ?? {
    id: '__draft__', repertoireId: activeRepertoireId, name: activeRepertoire?.name ?? 'Nieuw repertoire',
    color: activeRepertoire?.color ?? newColor, moves: '', tags: [], note: '', due: 0, seen: 0,
  };
  const recommendedMoves = useMemo(() => {
    if (!explorer?.moves?.length || explorerFen !== game.fen()) return [];
    const whiteToMove = game.turn() === 'w';
    return explorer.moves.map(move => {
      const total = move.white + move.draws + move.black;
      const databaseScore = total
        ? ((whiteToMove ? move.white : move.black) + move.draws * 0.5) / total
        : 0.5;
      const engineLine = evalFen === game.fen()
        ? evalResult?.pvs.find(pv => pv.moves.trim().split(/\s+/)[0] === move.uci)
        : undefined;
      const rawCp = engineLine?.mate !== undefined
        ? (engineLine.mate > 0 ? 10000 : -10000)
        : engineLine?.cp;
      const sideCp = rawCp === undefined ? undefined : (whiteToMove ? rawCp : -rawCp);
      const engineScore = sideCp === undefined ? undefined : 1 / (1 + Math.exp(-sideCp / 180));
      const combinedScore = engineScore === undefined ? databaseScore : engineScore * 0.65 + databaseScore * 0.35;
      return { ...move, total, databaseScore, engineScore, combinedScore };
    }).sort((x, y) => y.combinedScore - x.combinedScore);
  }, [explorer, explorerFen, evalResult, evalFen, game]);
  const filtered = useMemo(
    () =>
      repertoireLines.filter(
        line =>
          (colorFilter === 'Alles' || line.color === colorFilter) &&
          (
            line.name +
            ' ' +
            line.moves +
            ' ' +
            line.tags.join(' ') +
            ' ' +
            line.note
          )
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [repertoireLines, query, colorFilter]
  );
  const totalSeen = lines.reduce((sum, line) => sum + line.seen, 0);
  const trainingHealth = useMemo(() => {
    const ownMoves = Object.entries(moveMemory).filter(([key]) => lines.some(line => key.startsWith(line.id + ':')));
    const moveAttempts = ownMoves.reduce((sum, [, item]) => sum + item.seen, 0);
    const moveMisses = ownMoves.reduce((sum, [, item]) => sum + item.misses, 0);
    const accuracy = moveAttempts ? Math.round((moveAttempts - moveMisses) / moveAttempts * 100) : null;
    const weakest = [...lines].map(line => {
      const memories = ownMoves.filter(([key]) => key.startsWith(line.id + ':')).map(([, item]) => item);
      const misses = memories.reduce((sum, item) => sum + item.misses, 0) + (missedMoves[line.id] ?? 0);
      const attempts = memories.reduce((sum, item) => sum + item.seen, 0);
      return { line, misses, attempts, due: !line.due || line.due <= Date.now() || dueMoveLineIds.has(line.id) };
    }).sort((a, b) => b.misses - a.misses || Number(b.due) - Number(a.due) || a.attempts - b.attempts).slice(0, 5);
    return { moveAttempts, moveMisses, accuracy, weakest };
  }, [lines, moveMemory, missedMoves]);
  const dueMoveLineIds = new Set(Object.entries(moveMemory).filter(([, item]) => item.due <= Date.now()).map(([key]) => key.slice(0, key.lastIndexOf(':'))));
  const dueCount = lines.filter(line => !line.due || line.due <= Date.now() || dueMoveLineIds.has(line.id)).length;
  const transpositions = useMemo(() => analyzeTranspositions(repertoireLines), [repertoireLines]);
  const reviewLines = lines.filter(line => dueIds.length ? dueIds.includes(line.id) : ((!line.due || line.due <= Date.now()) || dueMoveLineIds.has(line.id)));
  const review = reviewLines.length
    ? reviewLines[reviewIndex % reviewLines.length]
    : null;
  useEffect(() => { if (review) prepareBoardTraining(review); }, [review?.id]);
  const board = game.board();
  const legalTargets = selected
    ? game.moves({ square: selected, verbose: true }).map(move => move.to)
    : [];
  const moveList = game.history();

  const lastExplorerRequestAt = useRef(0);

  async function fetchExplorer(url: URL): Promise<Response> {
    const waitMs = Math.max(0, 2500 - (Date.now() - lastExplorerRequestAt.current));
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    lastExplorerRequestAt.current = Date.now();
    return fetch(url.toString(), { headers: explorerRequestHeaders() });
  }

  function explorerRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = explorerToken.trim();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function explorerHttpError(status: number): string {
    if (status === 401 || status === 403) {
      return explorerToken.trim()
        ? 'Lichess weigert de API-token. Controleer of de token geldig is en opnieuw is gekopieerd.'
        : 'Lichess vereist nu een gratis API-token. Voeg die toe bij de instellingen voor de openingsdatabase.';
    }
    if (status === 429) return 'Lichess beperkt tijdelijk het aantal verzoeken. Wacht ongeveer een minuut en probeer opnieuw.';
    return 'Lichess gaf een foutmelding (' + status + '). Probeer het later opnieuw.';
  }

  async function checkRepertoireCoverage() {
    if (coverageLoading || !repertoireLines.length) return;
    setCoverageLoading(true);
    setCoverage({});
    const results: Record<string, { games: number; error?: string }> = {};
    try {
      for (const line of repertoireLines) {
        const position = newGame(line.moves);
        const fen = position.fen();
        try {
          const url = new URL('https://explorer.lichess.org/masters');
          url.searchParams.set('variant', 'standard');
          url.searchParams.set('fen', fen);
          url.searchParams.set('moves', '1');
          url.searchParams.set('topGames', '0');
          url.searchParams.set('recentGames', '0');
          const response = await fetchExplorer(url);
          if (!response.ok) throw new Error(explorerHttpError(response.status));
          const data = await response.json() as ExplorerResult;
          results[line.id] = { games: (data.white || 0) + (data.draws || 0) + (data.black || 0) };
        } catch (error) {
          results[line.id] = { games: 0, error: error instanceof Error ? error.message : 'Database niet bereikbaar' };
        }
        setCoverage({ ...results });
      }
    } finally {
      setCoverageLoading(false);
    }
  }

  async function auditRepertoireQuality() {
    if (qualityLoading || !repertoireLines.length) return;
    setQualityLoading(true);
    setQualityAuditDone(false);
    setQualityAudit([]);
    const findings: { lineId: string; lineName: string; ply: number; san: string; severity: 'high' | 'medium'; message: string; games: number }[] = [];
    try {
      for (const line of repertoireLines) {
        let position: Chess;
        try { position = newGame(line.moves); } catch { continue; }
        const history = position.history({ verbose: true });
        const replay = new Chess();
        for (let index = 0; index < history.length; index++) {
          const move = history[index];
          const isOurMove = line.color === 'Wit' ? index % 2 === 0 : index % 2 === 1;
          if (!isOurMove) {
            // Flag common opponent replies for which this repertoire has no saved continuation.
            try {
              const url = new URL('https://explorer.lichess.org/masters');
              url.searchParams.set('variant', 'standard');
              url.searchParams.set('fen', replay.fen());
              url.searchParams.set('moves', '8');
              url.searchParams.set('topGames', '0');
              url.searchParams.set('recentGames', '0');
              const response = await fetchExplorer(url);
              if (response.ok) {
                const data = await response.json() as ExplorerResult;
                const total = (data.white || 0) + (data.draws || 0) + (data.black || 0);
                const covered = new Set<string>();
                for (const candidateLine of repertoireLines) {
                  try {
                    const candidateHistory = newGame(candidateLine.moves).history();
                    const currentPrefix = history.slice(0, index).map(item => item.san);
                    if (currentPrefix.every((san, i) => candidateHistory[i] === san) && candidateHistory.length > index) covered.add(candidateHistory[index]);
                  } catch {}
                }
                for (const candidate of (data.moves ?? []).slice(0, 5)) {
                  const games = candidate.white + candidate.draws + candidate.black;
                  if (!covered.has(candidate.san) && games >= 20 && total > 0 && games / total >= 0.08) {
                    findings.push({ lineId: line.id, lineName: line.name, ply: index + 1, san: candidate.san, severity: 'medium', message: 'Veelvoorkomende tegenzet ontbreekt als eigen vervolg in het repertoire (' + games + ' masterpartijen; ' + Math.round(games / total * 100) + '%). Voeg een antwoordvariant toe of markeer dit als bewust buiten je repertoire.', games });
                  }
                }
              }
            } catch { /* Continue the audit if the explorer is unavailable. */ }
          } else {
            try {
              const url = new URL('https://explorer.lichess.org/masters');
              url.searchParams.set('variant', 'standard');
              url.searchParams.set('fen', replay.fen());
              url.searchParams.set('moves', '12');
              url.searchParams.set('topGames', '0');
              url.searchParams.set('recentGames', '0');
              const response = await fetchExplorer(url);
              if (response.ok) {
                const data = await response.json() as ExplorerResult;
                const total = (data.white || 0) + (data.draws || 0) + (data.black || 0);
                const candidate = data.moves?.find(item => item.san === move.san);
                const games = candidate ? candidate.white + candidate.draws + candidate.black : 0;
                if (!candidate) {
                  findings.push({ lineId: line.id, lineName: line.name, ply: index + 1, san: move.san, severity: 'high', message: 'Deze zet komt niet voor als vervolg in de masterdatabase; controleer op een mogelijke fout of een bewuste zeldzame keuze.', games: 0 });
                } else if (games < 20) {
                  findings.push({ lineId: line.id, lineName: line.name, ply: index + 1, san: move.san, severity: 'medium', message: 'Weinig masterpartijen ondersteunen deze zet (' + games + '); de database geeft onvoldoende zekerheid.', games });
                } else if (total >= 100 && games / total < 0.03) {
                  findings.push({ lineId: line.id, lineName: line.name, ply: index + 1, san: move.san, severity: 'medium', message: 'Zeldzame keuze in deze stelling (' + Math.round(games / total * 100) + '% van de masterpartijen); vergelijk met de populairste alternatieven.', games });
                }
              }
            } catch { /* Network errors should not interrupt the rest of the audit. */ }
          }
          try { replay.move(move.san); } catch { break; }
        }
        setQualityAudit([...findings]);
      }
    } finally {
      setQualityLoading(false);
      setQualityAuditDone(true);
    }
  }

  async function autofillCurrentPosition() {
    if (!activeRepertoire) { setNotice('Maak eerst een repertoire aan voordat je het automatisch aanvult.'); return; }
    if (autofillLoading) return;
    setAutofillLoading(true);
    setNotice('');
    try {
      const root = new Chess(game.fen());
      const prefix = game.history();
      const source = explorerSource === 'masters' ? 'masters' : 'lichess';
      const fetchMoves = async (position: Chess): Promise<ExplorerMove[]> => {
        const url = new URL('https://explorer.lichess.org/' + source);
        url.searchParams.set('variant', 'standard');
        url.searchParams.set('fen', position.fen());
        url.searchParams.set('moves', '8');
        url.searchParams.set('topGames', '0');
        url.searchParams.set('recentGames', '0');
        if (source === 'lichess' && ratingBand !== 'all') url.searchParams.set('ratings', ratingBand);
        const response = await fetchExplorer(url);
        if (!response.ok) throw new Error(explorerHttpError(response.status));
        return ((await response.json()) as ExplorerResult).moves ?? [];
      };
      // Generate a bounded, multi-ply opening tree rather than just one move and one reply.
      const maxDepth = 40;
      const maxBranches = 36;
      const maxChildren = 3;
      const minGames = 12;
      const additions: Line[] = [];
      const known = new Set(repertoireLines.map(line => {
        try { return newGame(line.moves).history().join(' '); } catch { return ''; }
      }));
      const walk = async (position: Chess, path: string[], depth: number): Promise<void> => {
        if (depth >= maxDepth || additions.length >= maxBranches) return;
        let moves: ExplorerMove[];
        try { moves = await fetchMoves(position); } catch { return; }
        if (!moves.length) return;
        const perspective = position.turn() === 'w' ? 'white' : 'black';
        const ranked = rankBookBuilderCandidates(moves, perspective, minGames);
        // Keep only statistically meaningful candidates. Tiny samples can
        // look excellent by chance and should not create learned repertoire lines.
        const eligible = ranked
          .filter(move => move.games >= minGames && move.recommended)
          .slice(0, maxChildren);
        if (!eligible.length) return;
        for (const candidate of eligible) {
          if (additions.length >= maxBranches) break;
          const next = new Chess(position.fen());
          try { next.move(candidate.san); } catch { continue; }
          const nextPath = [...path, candidate.san];
          // Save each meaningful branch as a PGN line, so the existing repertoire tree
          // can merge shared prefixes and show all generated continuations.
          const fullPath = [...prefix, ...nextPath];
          const signature = fullPath.join(' ');
          if (fullPath.length > prefix.length && !known.has(signature)) {
            const saved = new Chess();
            try {
              for (const san of fullPath) saved.move(san);
            } catch { continue; }
            additions.push({
              id: crypto.randomUUID(),
              repertoireId: activeRepertoireId,
              name: (current?.name ?? 'Variant') + ' — ' + nextPath.join(' '),
              color: current?.color ?? (prefix.length % 2 === 0 ? 'Wit' : 'Zwart'),
              moves: saved.pgn(),
              tags: [...(current?.tags ?? []), 'BookBuilder-stijl automatisch opgebouwd'],
              note: 'Automatisch voorgestelde vertakking op basis van Lichess-partijdata. Rangschikking houdt rekening met resultaat, steekproefgrootte en populariteit. Controleer de volledige variant en engine-evaluatie voordat je deze leert.',
              due: 0,
              seen: 0,
            });
            known.add(signature);
          }
          await walk(next, nextPath, depth + 1);
        }
      };
      await walk(root, [], 0);
      if (!additions.length) {
        setNotice('Geen nieuwe vertakkingen gevonden. Probeer een andere stelling of databron.');
      } else {
        setLines(previous => [...previous, ...additions]);
        setNotice(additions.length + ' meerlagige vertakkingen toegevoegd (maximaal ' + maxDepth + ' halve zetten en ' + maxBranches + ' nieuwe lijnen). Controleer de varianten en engine-evaluaties voordat je ze leert.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Automatisch aanvullen is mislukt.');
    } finally {
      setAutofillLoading(false);
    }
  }

  async function reviewLichessGames() {
    const username = gameUsername.trim();
    if (!username || gameReviewLoading) return;
    setGameReviewLoading(true);
    setGameReview([]);
    try {
      const response = await fetch('https://lichess.org/api/games/user/' + encodeURIComponent(username) + '?max=30&opening=true', {
        headers: { Accept: 'application/x-chess-pgn' },
      });
      if (!response.ok) throw new Error(response.status === 404 ? 'Lichess-gebruiker niet gevonden.' : 'Lichess gaf fout ' + response.status + '.');
      const pgnText = await response.text();
      const chunks = splitPgnCollection(pgnText);
      const report: string[] = [];
      for (const chunk of chunks.slice(0, 30)) {
        try {
          const analysis = analyzeGameAgainstRepertoire(chunk, lines);
          report.push(analysis.summary);
        } catch { /* Ignore an individual malformed game and continue the report. */ }
      }
      setGameReview(report.length ? report : ['Geen leesbare partijen gevonden in de export.']);
    } catch (error) {
      setGameReview([error instanceof Error ? error.message : 'Partijen konden niet worden gecontroleerd.']);
    } finally {
      setGameReviewLoading(false);
    }
  }

  async function reviewChessComGames() {
    const username = chessComUsername.trim();
    if (!username || chessComReviewLoading) return;
    setChessComReviewLoading(true);
    setChessComReview([]);
    try {
      const archivesResponse = await fetch('https://api.chess.com/pub/player/' + encodeURIComponent(username.toLowerCase()) + '/games/archives');
      if (!archivesResponse.ok) throw new Error(archivesResponse.status === 404 ? 'Chess.com-gebruiker niet gevonden.' : 'Chess.com gaf fout ' + archivesResponse.status + '.');
      const archiveData = await archivesResponse.json() as { archives?: string[] };
      const archive = archiveData.archives?.[archiveData.archives.length - 1];
      if (!archive) throw new Error('Geen openbare partijen gevonden.');
      const gamesResponse = await fetch(archive);
      if (!gamesResponse.ok) throw new Error('De Chess.com-partijen konden niet worden opgehaald.');
      const gamesData = await gamesResponse.json() as { games?: Array<{ pgn?: string; end_time?: number; white?: { username?: string }; black?: { username?: string } }> };
      const report: string[] = [];
      const recent = [...(gamesData.games ?? [])].sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0)).slice(0, 25);
      for (const item of recent) {
        if (!item.pgn) continue;
        try {
          const analysis = analyzeGameAgainstRepertoire(item.pgn, lines);
          const date = analysis.summary;
          report.push((item.end_time ? new Date(item.end_time * 1000).toLocaleDateString('nl-NL') + ' · ' : '') + date);
        } catch { /* Ignore an individual malformed game and continue the report. */ }
      }
      setChessComReview(report.length ? report : ['Geen leesbare partijen in het meest recente openbare maandarchief.']);
    } catch (error) {
      setChessComReview([error instanceof Error ? error.message : 'Chess.com-partijen konden niet worden gecontroleerd.']);
    } finally {
      setChessComReviewLoading(false);
    }
  }

  function selectLine(line: Line) {
    setActive(line.id);
    setGame(newGame(line.moves));
    setSelected(null);
    setFenInput('');
    setNotice('');
  }
  function jumpToLineMove(line: Line, ply: number) {
    const candidate = newGame(line.moves);
    while (candidate.history().length > ply) candidate.undo();
    setActive(line.id);
    setGame(candidate);
    setSelected(null);
    setExplorer(null);
    setExplorerError('');
    setNotice('Stelling uit de repertoireboom geladen.');
  }
  function createRepertoire() {
    const name = newRepertoireName.trim();
    if (!name) { setNotice('Geef je repertoire een naam.'); return; }
    const repertoire: Repertoire = { id: crypto.randomUUID(), name, color: newColor, createdAt: Date.now() };
    setRepertoires(previous => [...previous, repertoire]);
    setActiveRepertoireId(repertoire.id);
    setActive('');
    setGame(newGame());
    setSelected(null);
    setNewRepertoireName('');
    setNotice('Repertoire aangemaakt. Speel zetten op het bord om je eerste variant op te bouwen.');
  }

  function renameActiveRepertoire() {
    if (!activeRepertoire) return;
    const name = editingRepertoireName.trim();
    if (!name) { setNotice('Geef het repertoire een naam.'); return; }
    setRepertoires(previous => previous.map(item => item.id === activeRepertoire.id ? { ...item, name } : item));
    setEditingRepertoireName('');
    setNotice('Repertoire hernoemd.');
  }
  function deleteActiveRepertoire() {
    if (!activeRepertoire) return;
    const removedId = activeRepertoire.id;
    setRepertoires(previous => previous.filter(item => item.id !== removedId));
    setLines(previous => previous.filter(line => line.repertoireId !== removedId));
    setActiveRepertoireId('');
    setActive('');
    setGame(newGame());
    setSelected(null);
    setNotice('Repertoire en bijbehorende varianten verwijderd.');
  }
  function exportActiveRepertoirePgn() {
    if (!activeRepertoire || !repertoireLines.length) {
      setNotice('Er zijn nog geen varianten om te exporteren.');
      return;
    }
    const escapeHeader = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
    const contents = repertoireLines.map((line, index) => {
      const game = newGame(line.moves);
      const pgn = game.pgn({ maxWidth: 100 });
      return [
        '[Event "' + escapeHeader(line.name) + '"]',
        '[Site "RepertoireLab"]',
        '[White "' + (line.color === 'Wit' ? 'Repertoire' : 'Opponent') + '"]',
        '[Black "' + (line.color === 'Zwart' ? 'Repertoire' : 'Opponent') + '"]',
        '[Round "' + (index + 1) + '"]',
        '',
        pgn || '*',
      ].join('\n');
    }).join('\n\n');
    const blob = new Blob([contents + '\n'], { type: 'application/x-chess-pgn;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeRepertoire.name.trim().replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() + '.pgn';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('PGN geëxporteerd met ' + repertoireLines.length + ' varianten.');
  }

  function addExplorerMoveToRepertoire(san: string) {
    if (!activeRepertoire) {
      setNotice('Maak eerst een repertoire aan voordat je zetten toevoegt.');
      return;
    }
    const candidate = cloneGame(game);
    try {
      candidate.move(san);
    } catch {
      setNotice('Deze zet is niet legaal in de huidige stelling.');
      return;
    }
    const signature = candidate.history().join(' ');
    const duplicate = repertoireLines.find(line => {
      try { return newGame(line.moves).history().join(' ') === signature; } catch { return false; }
    });
    if (duplicate) {
      setActive(duplicate.id);
      setGame(candidate);
      setNotice('Deze zetvolgorde staat al in je repertoire als “' + duplicate.name + '”.');
      return;
    }
    const parentPrefix = game.history().join(' ');
    const parentLine = repertoireLines
      .filter(line => {
        try {
          const history = newGame(line.moves).history();
          return history.length <= parentPrefix.split(' ').filter(Boolean).length &&
            parentPrefix.startsWith(history.join(' ')) &&
            history.join(' ') === parentPrefix;
        } catch { return false; }
      })
      .sort((left, right) => right.moves.length - left.moves.length)[0];
    const name = branchName.trim() || ((parentLine?.name ?? activeRepertoire.name) + ' — ' + san);
    const line: Line = {
      id: crypto.randomUUID(),
      repertoireId: activeRepertoire.id,
      name,
      color: activeRepertoire.color,
      moves: candidate.pgn(),
      tags: ['Eigen variant', 'Repertoireboom'],
      note: '',
      due: 0,
      seen: 0,
    };
    setLines(previous => [line, ...previous]);
    setActive(line.id);
    setGame(candidate);
    setBranchName('');
    setNotice('Zet ' + san + ' toegevoegd als variant aan ' + activeRepertoire.name + '.');
  }

  function saveCurrentBranch() {
    const history = game.history();
    if (!history.length) { setNotice('Speel eerst minstens één zet voordat je een variant opslaat.'); return; }
    if (!activeRepertoire) { setNotice('Maak eerst een repertoire aan.'); return; }
    if (!branchName.trim()) { setNotice('Geef de nieuwe variant eerst een naam.'); return; }
    const branch: Line = {
      id: crypto.randomUUID(),
      repertoireId: activeRepertoire.id,
      name: branchName.trim(),
      color: activeRepertoire.color,
      moves: game.pgn(),
      tags: [...(current?.tags ?? []), 'Eigen vertakking'],
      note: current?.note ?? '',
      due: 0,
      seen: 0,
    };
    setLines(previous => [branch, ...previous]);
    setActive(branch.id);
    setBranchName('');
    setNotice('Variant opgeslagen in ' + activeRepertoire.name + '.');
  }
  function replaceCurrentLine() {
    if (!current) return;
    if (!game.history().length) {
      setNotice('De beginstelling kan niet als openinglijn worden opgeslagen.');
      return;
    }
    setLines(previous => previous.map(line => line.id === current.id
      ? { ...line, moves: game.pgn() }
      : line
    ));
    setNotice('Geselecteerde variant bijgewerkt met de zetten op het bord.');
  }
  function clickSquare(square: Square) {
    if (selected && legalTargets.includes(square)) {
      const copy = cloneGame(game);
      try {
        copy.move({ from: selected, to: square, promotion: 'q' });
        setGame(copy);
        setSelected(null);
        setNotice('');
      } catch {
        setSelected(square);
      }
      return;
    }
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) setSelected(square);
    else setSelected(null);
  }
  function resetBoard() {
    // "Beginstelling" must actually return to move zero, so the user can build a fresh branch.
    setGame(newGame());
    setActive('');
    setSelected(null);
    setNotice('Beginstelling geladen. Speel je zetten en sla ze op als nieuwe variant.');
  }
  function saveLine() {
    if (!activeRepertoire) { setNotice('Maak eerst een repertoire aan voordat je een variant opslaat.'); return; }
    if (!newName.trim()) {
      setNotice('Geef de variant een naam.');
      return;
    }
    const candidate = newGame();
    if (!newMoves.trim()) {
      setNotice('Voer je eigen zetten in of importeer een PGN voordat je de variant opslaat.');
      return;
    }
    try {
      candidate.loadPgn(newMoves);
    } catch {
      setNotice('Controleer de PGN-notatie en probeer opnieuw.');
      return;
    }
    if (!candidate.history().length) {
      setNotice('De variant moet minstens één zet bevatten.');
      return;
    }
    const line: Line = {
      id: crypto.randomUUID(),
      repertoireId: activeRepertoire.id,
      name: newName.trim(),
      color: activeRepertoire.color,
      moves: newMoves.trim(),
      tags: ['Eigen variant'],
      note: newNote.trim(),
      due: 0,
      seen: 0,
    };
    setLines(prev => [line, ...prev]);
    setActive(line.id);
    setGame(candidate);
    setShowAdd(false);
    setNewName('');
    setNewNote('');
    setNotice('Variant opgeslagen.');
  }
  function renameActiveVariant() {
    if (!current || current.id === '__draft__') { setNotice('Selecteer eerst een opgeslagen variant.'); return; }
    const name = editingVariantName.trim();
    if (!name) { setNotice('Geef de variant een naam.'); return; }
    setLines(previous => previous.map(line => line.id === current.id ? { ...line, name } : line));
    setEditingVariantName('');
    setNotice('Variant hernoemd.');
  }
  function deleteLine(id: string) {
    const next = lines.filter(line => line.id !== id);
    setLines(next);
    if (active === id) {
      const nextInRepertoire = next.find(line => line.repertoireId === activeRepertoireId);
      setActive(nextInRepertoire?.id ?? '');
      setGame(newGame(nextInRepertoire?.moves));
    }
    setNotice('Variant verwijderd.');
  }
  function importPgn() {
    if (!activeRepertoire) {
      setNotice('Maak eerst een repertoire aan voordat je PGN importeert.');
      return;
    }
    const chunks = splitPgnCollection(pgnInput);
    if (!chunks.length) {
      setNotice('Plak eerst een geldige PGN.');
      return;
    }
    const imported: Line[] = [];
    for (let index = 0; index < chunks.length; index++) {
      const candidate = new Chess();
      try {
        candidate.loadPgn(chunks[index]);
        if (!candidate.history().length) continue;
        const eventName = chunks[index].match(/\[Event\s+"([^"]+)"/)?.[1];
        imported.push({
          id: crypto.randomUUID(),
          repertoireId: activeRepertoire.id,
          name: eventName && eventName !== '?' ? eventName : (chunks.length > 1 ? 'Geïmporteerde variant ' + (index + 1) : 'Geïmporteerde variant'),
          color: pgnColor,
          moves: candidate.pgn(),
          tags: ['PGN-import'],
          note: 'Geïmporteerd via PGN.',
          due: 0,
          seen: 0,
        });
      } catch {
        setNotice('PGN-import gestopt: variant ' + (index + 1) + ' bevat ongeldige zetten.');
        return;
      }
    }
    if (!imported.length) {
      setNotice('Geen geldige zetten gevonden in deze PGN.');
      return;
    }
    setLines(previous => [...imported, ...previous]);
    setActive(imported[0].id);
    setGame(newGame(imported[0].moves));
    setShowPgn(false);
    setPgnInput('');
    setNotice(imported.length + (imported.length === 1 ? ' variant geïmporteerd.' : ' varianten geïmporteerd.'));
  }
  function exportBackup() {
    const backup = { app: 'RepertoireLab', version: 2, exportedAt: new Date().toISOString(), lines, repertoires, activeRepertoireId, missedMoves, moveMemory };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
    a.download = 'repertoirelab-back-up-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Volledige back-up gedownload. Bewaar deze ook buiten dit apparaat.');
  }
  function restoreBackupData(raw: unknown, askConfirmation = true) {
    const validated = validateBackup(raw);
    if (askConfirmation && !window.confirm('De huidige gegevens vervangen door deze back-up? Exporteer eerst een back-up om gegevens te bewaren.')) return false;
    setLines(validated.lines); setRepertoires(validated.repertoires); setActiveRepertoireId(validated.activeRepertoireId);
    setMissedMoves(validated.missedMoves); setMoveMemory(validated.moveMemory);
    setActive(''); setGame(newGame()); setSelected(null); setNotice('Back-up volledig gecontroleerd en teruggezet.');
    return true;
  }
  async function restoreBackup(file?: File) {
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      restoreBackupData(raw);
    } catch (error) { setNotice('Back-up niet teruggezet: ' + (error instanceof Error ? error.message : 'bestand niet leesbaar.')); }
  }
  function submitTrainingMove() {
    if (!review) return;
    let expected: string[];
    try { expected = newGame(review.moves).history(); } catch { setTrainingFeedback('Deze variant bevat zetten die niet goed kunnen worden ingelezen.'); return; }
    if (trainingPly >= expected.length) { setTrainingComplete(true); return; }
    const input = trainingInput.trim().replace(/[!?+#]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
    const answer = expected[trainingPly].replace(/[!?+#]+/g, '');
    if (input === answer) {
      const next = trainingPly + 1;
      setTrainingPly(next); setTrainingInput('');
      setTrainingFeedback('Correct: ' + expected[trainingPly] + (next === expected.length ? ' — einde van de variant.' : ''));
      if (next === expected.length) setTrainingComplete(true);
    } else {
      setMissedMoves(previous => ({ ...previous, [review.id]: (previous[review.id] ?? 0) + 1 }));
      setTrainingFeedback('Niet goed. Probeer opnieuw; denk aan de ontwikkelingszet en de dreiging in deze stelling.');
    }
  }
  function isOwnTrainingPly(ply: number, color: 'Wit' | 'Zwart') { return color === 'Wit' ? ply % 2 === 0 : ply % 2 === 1; }
  function prepareBoardTraining(line: Line | null = review) {
    if (!line) return;
    try {
      const san = newGame(line.moves).history(); const replay = new Chess(); let ply = 0;
      // Start at the earliest due move when the whole line is not yet due.
      const startAt = selectDueOwnPly(san.length, line.color, moveMemory, line.id, line.due, Date.now());
      while (ply < startAt) { replay.move(san[ply]); ply++; }
      while (ply < san.length && !isOwnTrainingPly(ply, line.color)) { replay.move(san[ply]); ply++; }
      setTrainingPly(ply); setTrainingBoardFen(replay.fen()); setTrainingSelected(null); setTrainingInput(''); setTrainingEval(null); setTrainingEvalError('');
      setTrainingFeedback(ply >= san.length ? 'Geen eigen zetten meer in deze variant.' : (startAt > 0 ? 'Herhaling vanaf een individuele zet die aan de beurt is.' : 'Speel je volgende repertoirezet op het bord.'));
      setTrainingComplete(ply >= san.length);
    } catch { setTrainingFeedback('Deze variant bevat ongeldige zetten.'); }
  }
  async function analyzeTrainingPosition() {
    if (trainingEvalLoading) return;
    setTrainingEvalLoading(true); setTrainingEvalError(''); setTrainingEval(null);
    try { const result = await runLocalStockfish(trainingBoardFen === 'start' ? new Chess().fen() : trainingBoardFen, trainingAnalysisDepth); setTrainingEval(result); }
    catch (error) { setTrainingEvalError(error instanceof Error ? error.message : 'Analyse mislukt.'); }
    finally { setTrainingEvalLoading(false); }
  }
  function handleTrainingSquare(square: Square) {
    if (!review || trainingComplete) return;
    const currentBoard = trainingBoardFen === 'start' ? new Chess() : new Chess(trainingBoardFen); const piece = currentBoard.get(square);
    if (!trainingSelected) { if (piece && piece.color === currentBoard.turn()) setTrainingSelected(square); return; }
    try {
      const expected = newGame(review.moves).history();
      const expectedSan = expected[trainingPly] ?? '';
      // Match underpromotions when the repertoire explicitly calls for one.
      const promotion = expectedSan.match(/=([QRBN])/i)?.[1].toLowerCase() ?? 'q';
      const played = currentBoard.move({ from: trainingSelected, to: square, promotion });
      if (!played) { setTrainingSelected(piece && piece.color === currentBoard.turn() ? square : null); return; }
      const norm = (v: string) => v.replace(/[!?+#]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
      const key = review.id + ':' + trainingPly;
      if (norm(played.san) !== norm(expected[trainingPly] ?? '')) {
        setMoveMemory(prev => ({ ...prev, [key]: scheduleMoveResult(prev[key], false) }));
        setMissedMoves(prev => ({ ...prev, [review.id]: (prev[review.id] ?? 0) + 1 })); setTrainingFeedback('Niet de opgeslagen zet. Verwacht: ' + (expected[trainingPly] ?? 'einde van de variant') + '. Probeer opnieuw.'); setTrainingSelected(null); return;
      }
      setMoveMemory(prev => ({ ...prev, [key]: scheduleMoveResult(prev[key], true) }));
      let next = trainingPly + 1; const replay = new Chess(currentBoard.fen());
      while (next < expected.length && !isOwnTrainingPly(next, review.color)) { replay.move(expected[next]); next++; }
      setTrainingPly(next); setTrainingBoardFen(replay.fen()); setTrainingSelected(null); setTrainingFeedback(next >= expected.length ? 'Variant voltooid. Beoordeel nu hoe goed je de variant kende.' : 'Correct: ' + played.san + '. ' + (next > trainingPly + 1 ? 'Tegenzet automatisch afgespeeld. ' : '') + 'Speel de volgende repertoirezet.');
      if (next >= expected.length) { setTrainingComplete(true); setRevealed(true); }
    } catch { setTrainingSelected(null); }
  }
  function resetMoveTraining() { setTrainingPly(0); setTrainingInput(''); setTrainingFeedback(''); setTrainingComplete(false); setTrainingSelected(null); setTrainingBoardFen('start'); if (review) prepareBoardTraining(review); }
  function trainResult(remembered: boolean) {
    if (!review) return;
    if (!remembered) setMissedMoves(previous => ({ ...previous, [review.id]: (previous[review.id] ?? 0) + 1 }));
    const recentMoveMisses = Object.entries(moveMemory).filter(([key, item]) => key.startsWith(review.id + ':') && item.lastResult === 'miss' && item.due > Date.now() - 7 * 86400000).length;
    const scheduled = scheduleLineResult(review, remembered, recentMoveMisses);
    const nextSeen = scheduled.seen;
    const intervalDays = scheduled.intervalDays;
    const nextDue = scheduled.due;
    setLines(prev => prev.map(line => line.id === review.id ? {
      ...line, seen: nextSeen, due: nextDue, intervalDays: remembered ? intervalDays : 0,
      tags: remembered
        ? [...new Set([...(line.tags ?? []).filter(tag => tag !== 'Opnieuw oefenen'), 'Herhaling actief'])]
        : [...new Set([...(line.tags ?? []).filter(tag => tag !== 'Herhaling actief'), 'Opnieuw oefenen'])],
    } : line));
    setDueIds(prev => prev.filter(id => id !== review.id));
    setRevealed(false);
    setReviewIndex(0);
    setNotice(
      remembered ? 'Goed. Deze variant komt over ongeveer ' + Math.round(intervalDays) + ' dag(en) terug.' : 'Deze variant komt over 5 minuten opnieuw terug.'
    );
  }
  function loadFen() {
    const candidate = new Chess();
    try {
      candidate.load(fenInput.trim());
      setGame(candidate);
      setSelected(null);
      setNotice('Stelling geladen.');
      setExplorer(null);
      setExplorerError('');
    } catch {
      setNotice('Ongeldige FEN. Controleer de stelling.');
    }
  }

  async function lookupOpening() {
    if (explorerLoading) return;
    setExplorerLoading(true);
    setExplorerError('');
    setExplorer(null);
    const requestedFen = game.fen();
    setExplorerFen(requestedFen);
    try {
      const url = new URL(`https://explorer.lichess.org/${explorerSource}`);
      url.searchParams.set('variant', 'standard');
      url.searchParams.set('fen', requestedFen);
      url.searchParams.set('moves', '8');
      url.searchParams.set('topGames', '5');
      url.searchParams.set('recentGames', '0');
      if (explorerSource === 'lichess' && ratingBand !== 'all') url.searchParams.set('ratings', ratingBand);
      const response = await fetchExplorer(url);
      if (!response.ok) {
        throw new Error(explorerHttpError(response.status));
      }
      const data = (await response.json()) as ExplorerResult;
      setExplorer(data);
      if (!data.moves?.length) setExplorerError('Geen partijen gevonden voor deze stelling in de masterdatabase.');
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : 'De Lichess-database is niet bereikbaar. Controleer je internetverbinding.');
    } finally {
      setExplorerLoading(false);
    }
  }

  async function runLocalStockfish(requestedFen: string, requestedDepth = 16): Promise<CloudEval> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker('/stockfish/stockfish-19-lite-single.js');
      } catch {
        reject(new Error('Stockfish kon niet worden gestart. Vernieuw de app en probeer opnieuw.'));
        return;
      }
      let settled = false;
      let maxDepth = 0;
      let maxNodes = 0;
      const lines = new Map<number, { moves: string; cp?: number; mate?: number }>();
      const finish = (error?: Error, result?: CloudEval) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        worker.terminate();
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error('Stockfish gaf geen analyse terug.'));
      };
      const timeout = window.setTimeout(() => finish(new Error('Stockfish deed er te lang over. Probeer het opnieuw op een krachtiger apparaat.')), 60000);
      worker.onerror = () => finish(new Error('De lokale Stockfish-engine kon niet worden geladen. Controleer je verbinding en probeer opnieuw.'));
      worker.onmessage = event => {
        const line = String(event.data ?? '').trim();
        if (line === 'uciok') {
          worker.postMessage('setoption name MultiPV value 5');
          worker.postMessage('isready');
          return;
        }
        if (line === 'readyok') {
          worker.postMessage('position fen ' + requestedFen);
          worker.postMessage('go depth ' + Math.max(10, Math.min(24, Math.round(requestedDepth))));
          return;
        }
        if (line.startsWith('info ')) {
          const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] ?? 0);
          const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] ?? 1);
          const nodes = Number(line.match(/\bnodes\s+(\d+)/)?.[1] ?? 0);
          const score = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
          const pv = line.match(/\bpv\s+(.+)$/);
          if (!pv || !score || !depth) return;
          if (depth > maxDepth) {
            maxDepth = depth;
            lines.clear();
          }
          if (depth === maxDepth) {
            maxNodes = Math.max(maxNodes, nodes);
            const whiteToMove = requestedFen.split(' ')[1] !== 'b';
            const rawScore = Number(score[2]);
            const whiteScore = whiteToMove ? rawScore : -rawScore;
            lines.set(multipv, {
              moves: pv[1].trim(),
              ...(score[1] === 'mate' ? { mate: whiteScore } : { cp: whiteScore }),
            });
          }
          return;
        }
        if (line.startsWith('bestmove ')) {
          const pvs = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
          finish(undefined, { depth: maxDepth, knodes: Math.round(maxNodes / 1000), pvs });
        }
      };
      worker.postMessage('uci');
    });
  }

  async function lookupRecommendations() {
    if (recommendationLoading) return;
    setRecommendationLoading(true);
    setExplorerLoading(true);
    setEvalLoading(true);
    setExplorerError('');
    setEvalError('');
    setExplorer(null);
    setEvalResult(null);
    const requestedFen = game.fen();
    setExplorerFen(requestedFen);
    setEvalFen(requestedFen);
    try {
      const explorerUrl = new URL(`https://explorer.lichess.org/${explorerSource}`);
      explorerUrl.searchParams.set('variant', 'standard');
      explorerUrl.searchParams.set('fen', requestedFen);
      explorerUrl.searchParams.set('moves', '8');
      explorerUrl.searchParams.set('topGames', '5');
      explorerUrl.searchParams.set('recentGames', '0');
      if (explorerSource === 'lichess' && ratingBand !== 'all') explorerUrl.searchParams.set('ratings', ratingBand);
      const explorerResponse = await fetchExplorer(explorerUrl);
      if (!explorerResponse.ok) {
        throw new Error(explorerHttpError(explorerResponse.status));
      }
      const openingData = await explorerResponse.json() as ExplorerResult;
      setExplorer(openingData);
      if (!openingData.moves?.length) setExplorerError('Geen openingsstatistieken voor deze stelling gevonden.');
      try {
        const evaluation = await runLocalStockfish(requestedFen);
        if (!evaluation.pvs.length) throw new Error('Stockfish gaf geen hoofdvarianten terug.');
        setEvalResult(evaluation);
      } catch (error) {
        setEvalError(error instanceof Error ? error.message : 'Lokale Stockfish-analyse is mislukt.');
      }
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : 'De aanbevelingen konden niet worden opgehaald.');
    } finally {
      setExplorerLoading(false);
      setEvalLoading(false);
      setRecommendationLoading(false);
    }
  }

  function playExplorerMove(san: string) {
    if (game.fen() !== explorerFen) {
      setExplorerError('De stelling is veranderd. Zoek de database opnieuw op.');
      return;
    }
    const copy = cloneGame(game);
    try {
      copy.move(san);
      setGame(copy);
      setSelected(null);
      setExplorer(null);
      setExplorerError('');
      setEvalResult(null);
      setEvalError('');
    } catch {
      setExplorerError('Deze zet kon niet op het bord worden gezet.');
    }
  }

  function enterMoves() {
    const cleaned = moveInput
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/;[^\n]*/g, ' ')
      .replace(/\$\d+/g, ' ')
      .replace(/\d+\.(?:\.\.)?/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(token => token && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token) && token !== '...');
    if (!tokens.length) {
      setNotice('Voer eerst zetten in, bijvoorbeeld: Nf3 Nc6 d4.');
      return;
    }
    const copy = cloneGame(game);
    try {
      for (const token of tokens) {
        const uci = token.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
        if (uci) {
          copy.move({ from: uci[1].toLowerCase() as Square, to: uci[2].toLowerCase() as Square, promotion: (uci[3]?.toLowerCase() ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        } else {
          copy.move(token.replace(/[!?+#]+$/g, ''));
        }
      }
      setGame(copy);
      setSelected(null);
      setExplorer(null);
      setExplorerError('');
      setEvalResult(null);
      setEvalError('');
      setMoveInput('');
      setNotice(`${tokens.length} zet${tokens.length === 1 ? '' : 'ten'} op het bord gezet.`);
    } catch (error) {
      setNotice(`Zetten niet verwerkt: ${error instanceof Error ? error.message : 'controleer de notatie en de zetvolgorde.'}`);
    }
  }

    async function lookupEvaluation() {
    if (evalLoading) return;
    setEvalLoading(true);
    setEvalError('');
    setEvalResult(null);
    const requestedFen = game.fen();
    setEvalFen(requestedFen);
    try {
      const data = await runLocalStockfish(requestedFen);
      if (!data.pvs?.length) throw new Error('Stockfish heeft geen enginevarianten teruggegeven.');
      setEvalResult(data);
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : 'De lokale engine-analyse is mislukt.');
    } finally {
      setEvalLoading(false);
    }
  }

  function formatPv(uciMoves: string) {
    const copy = new Chess(game.fen());
    const san: string[] = [];
    for (const uci of uciMoves.split(/\s+/).slice(0, 8)) {
      const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
      if (!match) break;
      try {
        const move = copy.move({ from: match[1].toLowerCase() as Square, to: match[2].toLowerCase() as Square, promotion: (match[3]?.toLowerCase() ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        san.push(move.san);
      } catch {
        break;
      }
    }
    return san.join(' ');
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">♞</div>
          <div>
            <strong>RepertoireLab</strong>
            <small>SCHAAKSTUDIE</small>
          </div>
        </div>
        <div className="side-label">WERKRUIMTE</div>
        <button
          className={tab === 'overzicht' ? 'nav active' : 'nav'}
          onClick={() => setTab('overzicht')}
        >
          <Layers3 size={18} /> Overzicht
        </button>
        <button
          className={tab === 'repertoire' ? 'nav active' : 'nav'}
          onClick={() => setTab('repertoire')}
        >
          <BookOpen size={18} /> Mijn repertoire{' '}
          <span className="nav-count">{repertoires.length}</span>
        </button>
        <button
          className={tab === 'trainen' ? 'nav active' : 'nav'}
          onClick={() => {
            setTab('trainen');
            setDueIds([]);
            setRevealed(false);
          }}
        >
          <Brain size={18} /> Zettraining <span className="new-dot" />
        </button>
        <div className="sidebar-bottom">
          <div className="mini-card">
            <div className="mini-icon">
              <Target size={17} />
            </div>
            <div>
              <strong>Elke dag beter</strong>
              <p>Korte sessies bouwen herkenning op.</p>
            </div>
          </div>
          <button className="nav" onClick={exportBackup}>
            <Download size={18} /> Back-up exporteren
          </button>
          <div className="profile">
            <div className="avatar">RL</div>
            <div>
              <strong>Mijn repertoire</strong>
              <small>Alleen op dit apparaat</small>
            </div>
            <ShieldCheck size={16} className="muted" />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            Werkruimte <ChevronRight size={14} />{' '}
            <b>
              {tab === 'overzicht'
                ? 'Overzicht'
                : tab === 'repertoire'
                  ? 'Mijn repertoire'
                  : 'Zettraining'}
            </b>
          </div>
          <div className="top-actions">
            <span className="local-pill">
              <span /> Lokaal opgeslagen
            </span>
            <button
              className="icon-button"
              title="Back-up exporteren"
              onClick={exportBackup}
            >
              <Download size={18} />
            </button>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                onClick={() => setNotice('')}
                aria-label="Melding sluiten"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {tab === 'overzicht' && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow">
                    <Sparkles size={14} /> JOUW SCHAAKWERKPLAATS
                  </div>
                  <h1>
                    Speel je repertoire.
                    <br />
                    <span>Beheers de plannen.</span>
                  </h1>
                  <p>
                    Bewaar varianten, begrijp de ideeën en train ze tot je ze
                    direct herkent.
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="primary"
                      onClick={() => setTab('trainen')}
                    >
                      <Brain size={17} /> Start zettraining
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setTab('repertoire')}
                    >
                      Bekijk repertoire <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="hero-board" aria-hidden="true">
                  <div className="hero-piece">♞</div>
                  <div className="hero-caption">DENK IN PLANNEN</div>
                </div>
              </section>
              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon purple">
                    <BookOpen size={18} />
                  </div>
                  <span>Varianten</span>
                  <strong>{lines.length}</strong>
                  <small>in je repertoire</small>
                </div>
                <div className="stat-card">
                  <div className="stat-icon green">
                    <Brain size={18} />
                  </div>
                  <span>Herhalingen</span>
                  <strong>{totalSeen}</strong>
                  <small>trainingsbeurten voltooid</small>
                </div>
                <div className="stat-card">
                  <div className="stat-icon orange">
                    <Clock3 size={18} />
                  </div>
                  <span>Training</span>
                  <strong>{lines.length ? 'Klaar' : '—'}</strong>
                  <small>kies een variant om te starten</small>
                </div>
              </section>
              <section className="study-focus-panel">
                <div className="study-focus-heading">
                  <div>
                    <div className="eyebrow">PERSOONLIJKE STUDIEANALYSE</div>
                    <h2>Wat verdient aandacht?</h2>
                    <p>Gebruik je trainingsfouten om te bepalen welke varianten je als eerste opnieuw oefent.</p>
                  </div>
                  <div className="study-accuracy">
                    <strong>{trainingHealth.accuracy === null ? '—' : trainingHealth.accuracy + '%'}</strong>
                    <span>zetnauwkeurigheid</span>
                  </div>
                </div>
                <div className="study-focus-metrics">
                  <div><span>Geprobeerd</span><strong>{trainingHealth.moveAttempts}</strong></div>
                  <div><span>Gemist</span><strong>{trainingHealth.moveMisses}</strong></div>
                  <div><span>Nu te herhalen</span><strong>{dueCount}</strong></div>
                </div>
                {trainingHealth.weakest.length ? <div className="weak-lines-list">
                  {trainingHealth.weakest.map(({line, misses, attempts, due}) => <div className="weak-line-row" key={line.id}>
                    <div className={'line-badge ' + line.color.toLowerCase()}>{line.color === 'Wit' ? '♔' : '♚'}</div>
                    <div className="weak-line-info"><strong>{line.name}</strong><span>{misses} geregistreerde missers · {attempts} zetpogingen</span></div>
                    <span className={'weak-line-status' + (due ? ' due' : '')}>{due ? 'Te herhalen' : 'Later'}</span>
                    <button className="text-button" onClick={() => { selectLine(line); setDueIds([line.id]); setReviewIndex(0); setRevealed(false); setTab('trainen'); }}>Train</button>
                  </div>)}
                </div> : <p className="study-empty">Na je eerste zettraining verschijnen hier je lastigste varianten en je nauwkeurigheid.</p>}
                <div className="study-focus-actions">
                  <button className="primary" onClick={() => { setDueIds([]); setReviewIndex(0); setRevealed(false); setTab('trainen'); }}>Start herhaalronde</button>
                  <button className="secondary" onClick={() => { setDueIds(lines.map(line => line.id)); setReviewIndex(0); setRevealed(false); setTab('trainen'); }}>Train alles</button>
                </div>
              </section>
              <section className="section-head">
                <div>
                  <h2>Verder studeren</h2>
                  <p>Ga verder waar je gebleven bent.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setTab('repertoire')}
                >
                  Alle varianten <ChevronRight size={15} />
                </button>
              </section>
              <div className="line-cards">
                {lines.slice(0, 3).map(line => (
                  <button
                    className="line-card"
                    key={line.id}
                    onClick={() => {
                      selectLine(line);
                      setTab('repertoire');
                    }}
                  >
                    <div className={'line-badge ' + line.color.toLowerCase()}>
                      {line.color === 'Wit' ? '♔' : '♚'}
                    </div>
                    <div className="line-card-body">
                      <div className="line-title">{line.name}</div>
                      <div className="line-moves">{line.moves}</div>
                      <div className="tags">
                        {line.tags.slice(0, 2).map(tag => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight size={18} className="muted" />
                  </button>
                ))}
              </div>
              <section className="tip">
                <div className="tip-icon">
                  <CircleHelp size={19} />
                </div>
                <div>
                  <strong>Een tip voor effectief studeren</strong>
                  <p>
                    Leer niet alleen zetten uit je hoofd. Vraag jezelf bij
                    iedere stelling af: wat is mijn plan, wat dreigt mijn
                    tegenstander en welke stukken horen op welke velden?
                  </p>
                </div>
              </section>
            </>
          )}
          {tab === 'repertoire' && (
            <div className="repertoire-view">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">OPENINGEN & VARIANTEN</div>
                  <h1>Mijn repertoires</h1>
                  <p>Maak aparte repertoires voor wit, zwart of verschillende openingen. Varianten horen bij het geselecteerde repertoire.</p>
                </div>
              </div>
              <section className="repertoire-builder backup-tools">
                <div className="builder-actions"><div className="builder-side"><strong>Back-up en herstel</strong><span>Exporteer alle repertoires en trainingsgegevens. De gegevens staan lokaal in deze browser en kunnen verloren gaan bij het wissen van browserdata.</span><div className="move-entry-actions"><button className="primary" onClick={exportBackup}><Download size={15} /> Volledige back-up exporteren</button><label className="secondary file-restore-label">Back-up terugzetten <input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); event.currentTarget.value = ''; }} /></label></div></div></div>
              </section>
              <CloudSyncPanel
                backup={{ app: 'RepertoireLab', version: 2, exportedAt: new Date().toISOString(), lines, repertoires, activeRepertoireId, missedMoves, moveMemory }}
                onRestore={(raw) => { restoreBackupData(raw, false); }}
              />
              <section className="repertoire-builder">
                <div className="builder-actions">
                  <div className="builder-side">
                    <strong>Nieuw repertoire</strong>
                    <input aria-label="Naam nieuw repertoire" value={newRepertoireName} onChange={event => setNewRepertoireName(event.target.value)} placeholder="Bijv. Schots — wit" />
                    <select aria-label="Kleur nieuw repertoire" value={newColor} onChange={event => setNewColor(event.target.value as 'Wit' | 'Zwart')}>
                      <option value="Wit">Wit</option><option value="Zwart">Zwart</option>
                    </select>
                    <button className="primary" onClick={createRepertoire}><Plus size={16} /> Repertoire aanmaken</button>
                  </div>
                  <div className="builder-side">
                    <strong>Geselecteerd repertoire</strong>
                    <select aria-label="Actief repertoire" value={activeRepertoireId} onChange={event => {
                      const id = event.target.value;
                      setActiveRepertoireId(id);
                      const first = lines.find(line => line.repertoireId === id);
                      setActive(first?.id ?? '');
                      setGame(newGame(first?.moves));
                      setSelected(null);
                    }}>
                      <option value="">Kies een repertoire…</option>
                      {repertoires.map(item => <option key={item.id} value={item.id}>{item.name} ({item.color})</option>)}
                    </select>
                    <span>{activeRepertoire ? repertoireLines.length + ' varianten in ' + activeRepertoire.name : 'Maak of selecteer eerst een repertoire.'}</span>
                    {activeRepertoire && <>
                      <div className="repertoire-manage-row">
                        <input aria-label="Nieuwe naam voor repertoire" value={editingRepertoireName} onChange={event => setEditingRepertoireName(event.target.value)} placeholder={activeRepertoire.name} />
                        <button className="secondary" onClick={renameActiveRepertoire}>Naam wijzigen</button>
                      </div>
                      <div className="repertoire-manage-row">
                        <button className="secondary" onClick={exportActiveRepertoirePgn} disabled={!repertoireLines.length}><Download size={15} /> Exporteer PGN</button>
                        <button className="danger-button" onClick={() => { if (window.confirm('Verwijder repertoire “' + activeRepertoire.name + '” en alle varianten?')) deleteActiveRepertoire(); }}><Trash2 size={15} /> Verwijder repertoire</button>
                      </div>
                      <button className="primary" onClick={() => { setGame(newGame()); setActive(''); setBranchName(''); setSelected(null); setNewColor(activeRepertoire.color); setNotice('Nieuwe variant: speel de zetten op het bord en sla ze hierboven op.'); }}><Plus size={16} /> Variant toevoegen</button>
                    </>}
                  </div>
                </div>
              </section>
              <section className="repertoire-builder">
                <div className="builder-heading">
                  <div>
                    <div className="eyebrow">BOUW JE EIGEN REPERTOIRE</div>
                    <h2>Begin met een lege werkruimte</h2>
                    <p>Er zijn geen openingslijnen vooraf toegevoegd. Maak zelf een variant op het bord, importeer je eigen PGN of laat de database mogelijke zetten voorstellen. Je bepaalt zelf welke zetten in je repertoire komen.</p>
                  </div>
                </div>
                <div className="builder-actions">
                  <div className="builder-side">
                    <strong>1. Kies je kleur en startpositie</strong>
                    <span>Maak een nieuwe variant of begin vanaf de beginstelling op het bord.</span>
                    <button className="primary" onClick={() => { setNewMoves(''); setNewName(''); setShowAdd(true); }}>Eigen variant maken</button>
                  </div>
                  <div className="builder-side">
                    <strong>2. Bouw verder vanaf het bord</strong>
                    <span>Speel zelf zetten, maak vertakkingen en sla alleen je eigen keuzes op.</span>
                    <button className="secondary" onClick={() => { setGame(newGame()); setActive(''); setNotice('Beginstelling geladen. Speel zetten en gebruik daarna PGN import of maak een variant.'); }}>Beginstelling laden</button>
                  </div>
                </div>
                <div className="coverage-settings">
                  <div>
                    <label>
                      Lichess API-token (gratis)
                      <input type="password" autoComplete="off" value={explorerToken} onChange={event => setExplorerToken(event.target.value)} placeholder="Plak hier je persoonlijke API-token" aria-label="Lichess API-token" />
                    </label>
                    <p>De openingsdatabase vereist een token. Deze wordt alleen op dit apparaat opgeslagen en rechtstreeks naar Lichess gestuurd; voeg hem niet toe aan gedeelde code.</p>
                    <a href="https://lichess.org/account/oauth/token" target="_blank" rel="noreferrer">Maak een gratis token aan</a>
                  </div>
                  <div>
                    <label>
                      Ratingniveau voor zetstatistieken
                      <select value={ratingBand} onChange={event => setRatingBand(event.target.value)}>
                        <option value="1600">Rond 1600</option>
                        <option value="1800">Rond 1800</option>
                        <option value="2000">Rond 2000</option>
                        <option value="2200">Rond 2200</option>
                        <option value="2500">2500+</option>
                        <option value="all">Alle ratings</option>
                      </select>
                    </label>
                    <p>Filtert Lichess-partijstatistieken op de gekozen ratinggroep; masterpartijen gebruiken hun eigen selectie.</p>
                  </div>
                  <label>
                    Doel: maximaal aantal masterpartijen voor de eindstelling
                    <input type="number" min="1" max="1000000" value={positionGoal} onChange={event => setPositionGoal(Math.max(1, Math.min(1000000, Number(event.target.value) || 1)))} />
                  </label>
                  <div>
                    <p>Controleer hoe vaak de eindstelling van elke opgeslagen lijn voorkomt in de Lichess-masterdatabase. Als een stelling vaker voorkomt dan je doel, voeg dan meer zetten toe en controleer opnieuw. Het doel wordt op dit apparaat bewaard.</p>
                    <button className="primary" onClick={checkRepertoireCoverage} disabled={coverageLoading || !repertoireLines.length}>{coverageLoading ? 'Database controleren…' : 'Controleer openingsdiepte'}</button>
                  </div>
                  <div>
                    <p>Controleer je eigen zetten in dit repertoire tegen masterpartijen. De controle vindt ongebruikelijke of onvoldoende onderbouwde zetten, maar vervangt geen engine-analyse.</p>
                    <button className="secondary" onClick={auditRepertoireQuality} disabled={qualityLoading || !repertoireLines.length}>{qualityLoading ? 'Zetten controleren…' : 'Analyseer repertoirekwaliteit'}</button>
                  </div>
                </div>
                {qualityAuditDone && qualityAudit.length === 0 && <div className="coverage-summary">Geen databasewaarschuwingen gevonden voor de eigen zetten in dit repertoire. Dit is geen bewijs dat alle zetten engine-technisch optimaal zijn.</div>}
                {qualityAudit.length > 0 && <section className="coverage-results">
                  <div className="coverage-summary"><strong>Kwaliteitscontrole:</strong> {qualityAudit.filter(item => item.severity === 'high').length} kritieke aandachtspunten en {qualityAudit.filter(item => item.severity === 'medium').length} zetten om nader te bekijken. Dit zijn databasewaarschuwingen, geen bewezen blunders.</div>
                  {qualityAudit.map((item, index) => <div className="coverage-row" key={item.lineId + '-' + item.ply + '-' + index}>
                    <div><strong>{item.lineName} · zet {item.ply}: {item.san}</strong><span>{item.message}</span></div>
                    <button className="text-button" onClick={() => { const line = lines.find(candidate => candidate.id === item.lineId); if (line) { setActive(line.id); setGame(newGame(line.moves)); setTab('repertoire'); } }}>Bekijk lijn</button>
                  </div>)}
                </section>}
                {qualityAudit.length === 0 && !qualityLoading && false && <div />}
                <section className="coverage-results">
                  <button className="secondary full-width" onClick={() => setShowOpeningIdeas(value => !value)}>{showOpeningIdeas ? 'Verberg openingsideeën en fouten' : 'Toon openingsideeën en fouten'}</button>
                  {showOpeningIdeas && <>
                    <div className="coverage-summary"><strong>Openingsideeën en trainingsfouten</strong><br />Gebruik de notities om het plan te leren; fouten tellen op wanneer je een zet niet weet of een variant als moeilijk beoordeelt.</div>
                    {repertoireLines.map(line => <div className="coverage-row" key={'ideas-' + line.id}>
                      <div><strong>{line.name}</strong><span>{line.note || 'Voeg bij deze variant een strategisch plan toe.'}</span><span className="answer-moves">{line.moves}</span><span>{missedMoves[line.id] ?? 0} gemiste trainingszetten geregistreerd</span></div>
                      <button className="text-button" onClick={() => { setActive(line.id); setGame(newGame(line.moves)); setTab('repertoire'); }}>Bestudeer</button>
                    </div>)}
                  </>}
                </section>
                {Object.keys(coverage).length > 0 && (<>
                  <div className="coverage-summary">
                    Repertoirediepte: {Math.round(Object.values(coverage).filter(item => !item.error && item.games <= positionGoal).length / Math.max(1, Object.keys(coverage).length) * 100)}% van de gecontroleerde lijnen zit onder je frequentiedoel. Dit meet dekking/diepte, niet de objectieve schaakkwaliteit.
                  </div>
                  <div className="coverage-results">
                    <div className="coverage-summary">
                      {Object.values(coverage).filter(item => !item.error && item.games <= positionGoal).length} van {repertoireLines.length} lijnen hebben een eindstelling met maximaal {positionGoal.toLocaleString('nl-NL')} masterpartijen.
                    </div>
                    {repertoireLines.filter(line => coverage[line.id]).map(line => {
                      const result = coverage[line.id];
                      return (
                        <div className="coverage-row" key={line.id}>
                          <div><strong>{line.name}</strong><span>{result.error ? result.error : result.games.toLocaleString('nl-NL') + ' masterpartijen bij de eindstelling'}</span></div>
                          <span className={result.error ? 'coverage-status pending' : result.games <= positionGoal ? 'coverage-status done' : 'coverage-status extend'}>{result.error ? 'Niet gecontroleerd' : result.games <= positionGoal ? 'Diepte gehaald' : 'Voeg meer zetten toe'}</span>
                        </div>
                      );
                    })}
                  </div>
                </>)}
                {activeRepertoire && <section className="repertoire-insights">
                  <div className="insights-heading"><div><div className="eyebrow">STRUCTUURCONTROLE</div><h3>Transposities en herhalingen</h3><p>Zoek dezelfde stelling die via verschillende zettenreeksen ontstaat. Rokaderechten en en-passantrecht tellen mee.</p></div>
                    <button className="secondary" onClick={() => setShowTranspositions(value => !value)}>{showTranspositions ? 'Verbergen' : 'Toon analyse'} · {transpositions.length}</button></div>
                  {showTranspositions && <div className="coverage-results">{transpositions.length ? transpositions.map(item => <div className="coverage-row" key={item.fen}>
                    <div><strong>{item.paths} zettenreeksen · ply {item.ply}</strong><span>{item.names.slice(0, 4).join(' · ')}{item.names.length > 4 ? ' …' : ''}</span><code>{item.fen}</code></div>
                    <button className="secondary" onClick={() => { const candidate = new Chess(); try { candidate.load(item.fen + ' 0 1'); setGame(candidate); setSelected(null); setNotice('Transpositiepositie geladen. Zoek de database of voeg een vervolg toe.'); } catch { setNotice('Deze transpositie kon niet worden geladen.'); } }}>Stelling laden</button>
                  </div>) : <div className="empty-state">Geen transposities gevonden in dit repertoire. Dit kan veranderen zodra je meer varianten toevoegt.</div>}</div>}
                  <div className="insights-metrics"><div><strong>{repertoireLines.length}</strong><span>varianten</span></div><div><strong>{repertoireLines.reduce((sum, line) => sum + newGame(line.moves).history().length, 0)}</strong><span>halve zetten, inclusief overlap</span></div><div><strong>{repertoireLines.filter(line => !line.due || line.due <= Date.now()).length}</strong><span>varianten klaar voor herhaling</span></div></div>
                </section>}
                <div className="coverage-settings">
                  <div>
                    <h3>Partijen controleren tegen je repertoire</h3>
                    <p>Controleert maximaal 30 recente openbare Lichess-partijen en zoekt overeenkomsten met je opgeslagen varianten.</p>
                  </div>
                  <div className="game-review-controls">
                    <input aria-label="Lichess-gebruikersnaam" value={gameUsername} onChange={event => setGameUsername(event.target.value)} placeholder="Lichess-gebruikersnaam" />
                    <button className="primary" onClick={reviewLichessGames} disabled={gameReviewLoading || !gameUsername.trim()}>{gameReviewLoading ? 'Partijen controleren…' : 'Controleer partijen'}</button>
                  </div>
                  {gameReview.length > 0 && <div className="coverage-results">{gameReview.map((item, index) => <div className="coverage-row" key={index}><span>{item}</span></div>)}</div>}
                  <div className="game-review-controls chesscom-review-controls">
                    <input aria-label="Chess.com-gebruikersnaam" value={chessComUsername} onChange={event => setChessComUsername(event.target.value)} placeholder="Chess.com-gebruikersnaam" />
                    <button className="secondary" onClick={reviewChessComGames} disabled={chessComReviewLoading || !chessComUsername.trim()}>{chessComReviewLoading ? 'Partijen controleren…' : 'Controleer Chess.com'}</button>
                  </div>
                  {chessComReview.length > 0 && <div className="coverage-results">{chessComReview.map((item, index) => <div className="coverage-row" key={index}><span>{item}</span></div>)}</div>}
                </div>
              </section>
              <div className="toolbar">
                <div className="searchbox">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Zoek opening, zet of notitie…"
                  />
                </div>
                <div className="filterbox">
                  <Filter size={16} />
                  <select
                    value={colorFilter}
                    onChange={e =>
                      setColorFilter(e.target.value as typeof colorFilter)
                    }
                  >
                    <option>Alles</option>
                    <option>Wit</option>
                    <option>Zwart</option>
                  </select>
                </div>
                <button className="secondary" onClick={() => { setPgnColor(activeRepertoire?.color ?? 'Wit'); setShowPgn(true); }}>
                  <Upload size={16} /> PGN importeren
                </button>
              </div>
              <div className="repertoire-layout">
                <div className="line-list">
                  <div className="list-header">
                    {filtered.length} VARIANTEN{' '}
                    <span>SELECTEER OM TE STUDEREN</span>
                  </div>
                  {filtered.map(line => (
                    <div
                      key={line.id}
                      className={
                        'list-line ' + (line.id === active ? 'selected' : '')
                      }
                    >
                      <button
                        className="list-line-main"
                        onClick={() => selectLine(line)}
                      >
                        <div
                          className={
                            'line-badge small ' + line.color.toLowerCase()
                          }
                        >
                          {line.color === 'Wit' ? '♔' : '♚'}
                        </div>
                        <div className="line-card-body">
                          <strong>{line.name}</strong>
                          <span className="line-moves">{line.moves}</span>
                          <div className="tags">
                            {line.tags.map(tag => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        </div>
                      </button>
                      <button
                        className="delete-btn"
                        title="Variant verwijderen"
                        onClick={() => deleteLine(line.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div className="empty-state">
                      Je repertoire is nog leeg. Speel zetten op het studie bord hieronder en sla je eerste variant op. Je kunt ook een PGN importeren. Er worden geen openingslijnen vooraf ingevuld.
                    </div>
                  )}
                </div>
                {current && (
                  <div className="study-panel">
                    <div className="panel-head">
                      <div className="study-panel-title">
                        <div className="eyebrow">STUDIEBORD</div>
                        <h2>{current.name}</h2>
                        {current.id !== '__draft__' && <div className="repertoire-manage-row variant-rename-row">
                          <input aria-label="Naam van variant wijzigen" value={editingVariantName} onChange={event => setEditingVariantName(event.target.value)} placeholder={current.name} />
                          <button className="secondary" onClick={renameActiveVariant}>Hernoem variant</button>
                          <button className="danger" onClick={() => { if (current && window.confirm('Variant “' + current.name + '” verwijderen? Dit kan niet ongedaan worden gemaakt.')) deleteLine(current.id); }}>Verwijder variant</button>
                        </div>}
                      </div>
                      <span
                        className={'color-tag ' + current.color.toLowerCase()}
                      >
                        {current.color}
                      </span>
                    </div>
                    <section className="repertoire-tree-panel">
                      <div className="tree-panel-heading">
                        <div>
                          <div className="eyebrow">REPERTOIREBOOM</div>
                          <h3>Bouw je varianten vanuit het bord</h3>
                          <p>Begin vanuit de startstelling en speel de zetten zelf op het bord. Sla een reeks zetten op als variant; ga daarna terug naar een eerdere stelling om een andere vertakking te maken. Databasezetten zijn alleen suggesties en worden pas toegevoegd als jij ze kiest.</p>
                        </div>
                      </div>
                      <div className="branch-save-row">
                        {!repertoireLines.length && activeRepertoire && (
                          <select aria-label="Kleur van het repertoire" value={newColor} onChange={event => setNewColor(event.target.value as 'Wit' | 'Zwart')}>
                            <option value="Wit">Repertoire voor wit</option>
                            <option value="Zwart">Repertoire voor zwart</option>
                          </select>
                        )}
<input
                          aria-label="Naam van nieuwe variant of vertakking"
                          value={branchName}
                          onChange={event => setBranchName(event.target.value)}
                          placeholder={repertoireLines.length ? "Naam nieuwe variant, bijv. 4...Nf6" : "Naam van je eerste variant"}
                        />
                        <button className="primary" onClick={saveCurrentBranch}>{repertoireLines.length ? 'Variant opslaan' : 'Eerste variant opslaan'}</button>
                        <button className="secondary" disabled={!repertoireLines.length} onClick={replaceCurrentLine}>Variant bijwerken</button>
                      </div>
                      <details className="move-tree-details" open>
                        <summary>Gedeelde zettenboom ({repertoireLines.length} varianten)</summary>
                        <div className="move-tree-list">
                          {(() => {
                            type TreeNode = { san: string; ply: number; children: TreeNode[]; lineIds: string[] };
                            const root: TreeNode = { san: '', ply: 0, children: [], lineIds: [] };
                            for (const line of repertoireLines) {
                              let parent = root;
                              const path = newGame(line.moves).history();
                              path.forEach((san, index) => {
                                let child = parent.children.find(node => node.san === san);
                                if (!child) {
                                  child = { san, ply: index + 1, children: [], lineIds: [] };
                                  parent.children.push(child);
                                }
                                if (!child.lineIds.includes(line.id)) child.lineIds.push(line.id);
                                parent = child;
                              });
                            }
                            const renderNodes = (nodes: TreeNode[]): React.ReactNode[] => nodes.map(node => {
                              const owners = repertoireLines.filter(line => node.lineIds.includes(line.id));
                              const owner = owners.find(line => line.id === active) ?? owners[0];
                              return <div className={'move-tree-line' + (game.history().length === node.ply && game.history().join(' ') === newGame(owner?.moves).history().slice(0, node.ply).join(' ') ? ' current' : '')} key={node.ply + '-' + node.san}>
                                <div className="move-tree-moves">
                                  <button className="tree-move" title={owners.map(line => line.name).join(', ')} onClick={() => {
                                    if (!owner) return;
                                    const candidate = newGame(owner.moves);
                                    while (candidate.history().length > node.ply) candidate.undo();
                                    setActive(owner.id); setGame(candidate); setSelected(null);
                                  }}>
                                    {node.ply % 2 ? Math.ceil(node.ply / 2) + '. ' : Math.floor(node.ply / 2) + '... '}{node.san}
                                  </button>
                                  <span className="muted">{owners.length > 1 ? 'gedeeld door ' + owners.length + ' varianten' : owner?.name}</span>
                                </div>
                                {node.children.length > 0 && <div style={{ marginLeft: 18, borderLeft: '1px solid #ddd', paddingLeft: 10 }}>{renderNodes(node.children)}</div>}
                              </div>;
                            });
                            return renderNodes(root.children);
                          })()}
                        </div>
                      </details>
                    </section>
                    <div className="board-wrap">
                      <div className="chessboard">
                        {board.map((row, rowIndex) =>
                          row.map((piece, colIndex) => {
                            const rank = flip ? rowIndex + 1 : 8 - rowIndex;
                            const file = String.fromCharCode(
                              97 + (flip ? 7 - colIndex : colIndex)
                            );
                            const square = (file + rank) as Square;
                            const actualPiece = game.get(square);
                            const light = (rank + file.charCodeAt(0)) % 2 === 0;
                            const isSelected = selected === square;
                            const isTarget = legalTargets.includes(square);
                            return (
                              <button
                                key={square}
                                onClick={() => clickSquare(square)}
                                aria-label={square}
                                className={
                                  'square ' +
                                  (light ? 'light' : 'dark') +
                                  (isSelected ? ' chosen' : '') +
                                  (isTarget ? ' target' : '')
                                }
                              >
                                {actualPiece && (
                                  <span
                                    className={
                                      'piece ' +
                                      (actualPiece.color === 'w'
                                        ? 'white-piece'
                                        : 'black-piece')
                                    }
                                  >
                                    {
                                      pieceGlyph[
                                        actualPiece.color + actualPiece.type
                                      ]
                                    }
                                  </span>
                                )}
                                {colIndex === 0 && (
                                  <span className="rank-label">{rank}</span>
                                )}
                                {rowIndex === 7 && (
                                  <span className="file-label">{file}</span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="board-controls">
                      <button onClick={resetBoard}>Beginstelling</button>
                      <button
                        onClick={() => {
                          setGame(newGame());
                          setSelected(null);
                        }}
                      >
                        Nieuw bord
                      </button>
                      <button onClick={() => setFlip(v => !v)}>
                        Draai bord
                      </button>
                      <button
                        onClick={() => {
                          const copy = cloneGame(game);
                          copy.undo();
                          setGame(copy);
                          setSelected(null);
                        }}
                      >
                        Zet terug
                      </button>
                    </div>
                    <div className="builder-position-status">
                      <div>
                        <span className="eyebrow">HUIDIGE BOUWSTELLING</span>
                        <strong>{game.history().length ? game.history().length + (game.history().length === 1 ? ' halve zet gespeeld' : ' halve zetten gespeeld') : 'Beginstelling'}</strong>
                        <span>{game.turn() === 'w' ? 'Wit is aan zet' : 'Zwart is aan zet'}{activeRepertoire ? ' · ' + activeRepertoire.name : ' · Maak eerst een repertoire aan'}</span>
                      </div>
                      <button className="secondary" onClick={() => { setBranchName(''); setNotice(game.history().length ? 'Je kunt vanaf deze stelling een nieuwe vertakking spelen en opslaan.' : 'Speel een eerste zet op het bord en sla daarna de variant op.'); }} disabled={!activeRepertoire}>Vertakking vanaf deze stelling</button>
                    </div>
                    <div className="move-strip">
                      <span>ZETTEN</span>
                      <div>
                        {moveList.length ? (
                          moveList.map((move, i) => (
                            <span key={i} className="move-chip">
                              {i % 2 === 0 ? Math.floor(i / 2) + 1 + '. ' : ''}
                              {move}
                            </span>
                          ))
                        ) : (
                          <em>Nog geen zetten gespeeld</em>
                        )}
                      </div>
                    </div>
                    <section className="move-entry-panel">
                      <div className="eyebrow">VARIANT OPBOUWEN</div>
                      <p><strong>Speel je zetten direct op het schaakbord.</strong> Klik eerst op een stuk en daarna op het bestemmingsveld. De zetten worden in volgorde bijgehouden. Je kunt daarna de variant opslaan of verder uitbreiden.</p>
                      <div className="move-entry-actions">
                        <button className="secondary" onClick={() => {
                          const history = game.history();
                          if (!history.length) return;
                          const copy = cloneGame(game);
                          copy.undo();
                          setGame(copy);
                          setSelected(null);
                          setNotice('Laatste zet ongedaan gemaakt.');
                        }} disabled={!game.history().length}>Laatste zet ongedaan maken</button>
                        <button className="secondary" onClick={resetBoard}>Begin opnieuw</button>
                        <button className="primary" onClick={replaceCurrentLine} disabled={!current || !game.history().length}>Sla op in geselecteerde variant</button>
                      </div>
                      <details className="move-entry-notation">
                        <summary>Of voer zetten in via notatie</summary>
                        <textarea value={moveInput} onChange={event => setMoveInput(event.target.value)} placeholder="Nf3 Nc6 d4 d5" rows={2} />
                        <div className="move-entry-actions">
                          <button className="primary" onClick={enterMoves}>Speel notatie</button>
                          <button className="secondary" onClick={() => setMoveInput('')}>Wissen</button>
                        </div>
                      </details>
                    </section>
                    <div className="fen-row">
                      <input
                        value={fenInput}
                        onChange={e => setFenInput(e.target.value)}
                        placeholder="Plak FEN om een stelling te laden"
                      />
                      <button onClick={loadFen}>Laad FEN</button>
                    </div>
                    <section className="explorer-panel">
                      <div className="explorer-heading">
                        <div>
                          <div className="eyebrow">EXTERNE OPENINGSDATABASE</div>
                          <h3><BarChart3 size={17} /> Lichess Opening Explorer</h3>
                        </div>
                        <div className="explorer-controls">
                          <select aria-label="Kies database" value={explorerSource} onChange={event => setExplorerSource(event.target.value as 'masters' | 'lichess')}>
                            <option value="lichess">Lichess-partijen</option>
                            <option value="masters">Masterpartijen</option>
                          </select>
                          <button className="primary explorer-search" onClick={lookupOpening} disabled={explorerLoading}>
                            {explorerLoading ? 'Zoeken…' : 'Zoek stelling'}
                          </button>
                        </div>
                      </div>
                      <p className="explorer-description">Bekijk gespeelde zetten en resultaten. De aanbevelingen combineren score uit de partijendatabase met beschikbare Stockfish-evaluaties. Bij Lichess-partijen kun je het ratingniveau hierboven instellen.</p>
                      <button className="secondary recommendation-button" onClick={autofillCurrentPosition} disabled={autofillLoading}>{autofillLoading ? 'Reacties ophalen…' : 'Vul repertoire automatisch aan vanuit deze stelling'}</button>
                      <button className="primary explorer-search recommendation-button" onClick={lookupRecommendations} disabled={recommendationLoading}>
                        {recommendationLoading ? 'Aanbevelingen ophalen…' : 'Aanbevelingen op winrate + engine'}
                      </button>
                      {explorerError && <div className="explorer-message" role="status">{explorerError}</div>}
                      {explorer && explorerFen === game.fen() && (
                        <>
                          {explorer.opening?.name && <div className="opening-name">{explorer.opening.eco ? explorer.opening.eco + ' · ' : ''}{explorer.opening.name}</div>}
                          <div className="explorer-results">
                            <div><strong>{explorer.white.toLocaleString('nl-NL')}</strong><span>Wit wint</span></div>
                            <div><strong>{explorer.draws.toLocaleString('nl-NL')}</strong><span>Remise</span></div>
                            <div><strong>{explorer.black.toLocaleString('nl-NL')}</strong><span>Zwart wint</span></div>
                          </div>
                          <div className="recommendation-caption">Zetadvies voor {game.turn() === 'w' ? 'wit' : 'zwart'} · 65% lokale Stockfish-evaluatie + 35% database-score wanneer beide beschikbaar zijn. Als de engine niet start, wordt de database-score gebruikt.</div>
                          {(() => {
                            const prefix = game.history();
                            const knownNextMoves = new Set<string>();
                            for (const line of repertoireLines) {
                              try {
                                const history = newGame(line.moves).history();
                                if (history.length > prefix.length && prefix.every((san, index) => history[index] === san)) {
                                  knownNextMoves.add(history[prefix.length]);
                                }
                              } catch { /* ignore invalid legacy line */ }
                            }
                            const missingMoves = recommendedMoves.filter(move => !knownNextMoves.has(move.san));
                            const totalGames = recommendedMoves.reduce((sum, move) => sum + move.total, 0);
                            const coveredGames = recommendedMoves.reduce((sum, move) => sum + (knownNextMoves.has(move.san) ? move.total : 0), 0);
                            const weightedCoverage = totalGames ? coveredGames / totalGames * 100 : 0;
                            const priorityMoves = [...missingMoves].sort((a, b) => b.total - a.total);
                            return <div className="position-coverage">
                              <div>
                                <strong>Repertoiredekking op deze stelling</strong>
                                <span>{knownNextMoves.size} van {recommendedMoves.length} databasezetten · {Math.round(weightedCoverage)}% van de partijfrequentie afgedekt</span>
                              </div>
                              <div className="position-coverage-track"><i style={{ width: Math.min(100, weightedCoverage) + '%' }} /></div>
                              <small>{priorityMoves.length ? 'Prioriteit om toe te voegen: ' + priorityMoves.slice(0, 4).map(move => move.san + ' (' + Math.round(totalGames ? move.total / totalGames * 100 : 0) + '%)').join(', ') + (priorityMoves.length > 4 ? ' …' : '') : 'Alle getoonde databasezetten zijn al vertegenwoordigd in je repertoire.'}</small>
                            </div>;
                          })()}
                          {showModelGames && (explorer.topGames?.length ?? 0) > 0 && <section className="model-games">
                            <div className="model-games-heading"><strong>Modelpartijen uit deze stelling</strong><button className="text-button" onClick={() => setShowModelGames(false)}>Verbergen</button></div>
                            <p>Open een partij om te zien hoe sterke spelers de opening verder behandelen.</p>
                            {explorer.topGames?.map((model, index) => <a className="model-game-row" key={model.id + index} href={'https://lichess.org/' + encodeURIComponent(model.id)} target="_blank" rel="noreferrer">
                              <span className="model-game-number">{index + 1}</span><span className="model-game-players"><strong>{model.players?.white?.name ?? 'Wit'} {model.players?.white?.rating ? '(' + model.players.white.rating + ')' : ''} – {model.players?.black?.name ?? 'Zwart'} {model.players?.black?.rating ? '(' + model.players.black.rating + ')' : ''}</strong><small>{model.year ?? ''}{model.month ? '-' + model.month : ''} · {model.winner === 'white' ? 'Wit wint' : model.winner === 'black' ? 'Zwart wint' : 'Remise / onbekend'}</small></span><ChevronRight size={15} />
                            </a>)}
                          </section>}
                          {evalResult && evalFen === game.fen() && recommendedMoves.length > 1 && (() => {
                            const engineTopUci = evalResult.pvs[0]?.moves.trim().split(/\s+/)[0];
                            const engineTop = recommendedMoves.find(move => move.uci === engineTopUci);
                            const databaseTop = [...recommendedMoves].sort((a, b) => b.total - a.total)[0];
                            return engineTop && databaseTop && engineTop.uci !== databaseTop.uci ? (
                              <div className="explorer-message" role="status">
                                <strong>Engine en praktijk verschillen:</strong> Stockfish kiest {engineTop.san} als eerste kandidaat, terwijl {databaseTop.san} het vaakst is gespeeld ({databaseTop.total.toLocaleString('nl-NL')} partijen). Populariteit is niet hetzelfde als de beste zet; bekijk beide plannen voordat je kiest.
                              </div>
                            ) : null;
                          })()}
                          <div className="explorer-moves">
                            {recommendedMoves.map((move, index) => {
                              const total = move.total;
                              return (
                                <div className="explorer-move-row" key={move.uci}>
                                <button className="explorer-move" onClick={() => playExplorerMove(move.san)}>
                                  <span className="explorer-move-san">{index === 0 ? '★ ' : ''}{move.san}{index === 0 ? ' · Beste match' : ''}</span>
                                  <span className="explorer-move-count">{total.toLocaleString('nl-NL')} partijen · {Math.round(recommendedMoves.reduce((sum, item) => sum + item.total, 0) ? total / recommendedMoves.reduce((sum, item) => sum + item.total, 0) * 100 : 0)}% van de zetten · database {Math.round(move.databaseScore * 100)}%{move.engineScore === undefined ? '' : ` · engine ${Math.round(move.engineScore * 100)}%`}</span>
                                  <span className="explorer-bar" aria-label="Wit wint, remise, zwart wint">
                                    <i style={{ width: (total ? move.white / total * 100 : 0) + '%' }} />
                                    <i style={{ width: (total ? move.draws / total * 100 : 0) + '%' }} />
                                    <i style={{ width: (total ? move.black / total * 100 : 0) + '%' }} />
                                  </span>
                                </button>
                                <button
                                  className="add-explorer-move"
                                  onClick={() => addExplorerMoveToRepertoire(move.san)}
                                  disabled={!activeRepertoire}
                                  title={activeRepertoire ? 'Voeg ' + move.san + ' toe als variant aan ' + activeRepertoire.name : 'Maak eerst een repertoire aan'}
                                >+ Repertoire</button>
                              </div>
                              );
                            })}
                          </div>
                          <small className="explorer-attribution">Bron: Lichess Opening Explorer en beschikbare Lichess-cloud-evaluatie. Dit is een praktische rangschikking, geen garantie op de objectief beste zet. Klik op een zet om die op het bord te spelen.</small>
                        </>
                      )}
                      <a className="explorer-link" href={'https://lichess.org/analysis/' + encodeURIComponent(game.fen()) + '#explorer'} target="_blank" rel="noreferrer">Open in Lichess <ChevronRight size={14} /></a>
                    </section>
                    <section className="engine-panel">
                      <div className="engine-heading">
                        <div>
                          <div className="eyebrow">ENGINE-ANALYSE</div>
                          <h3><Cpu size={17} /> Lokale Stockfish-analyse</h3>
                        </div>
                        <button className="primary explorer-search" onClick={lookupEvaluation} disabled={evalLoading}>
                          {evalLoading ? 'Analyseren…' : 'Analyseer stelling'}
                        </button>
                      </div>
                      <p className="explorer-description">Draait Stockfish 19 Lite lokaal in je browser via WebAssembly. De standaarddiepte is 16; hogere dieptes zijn beschikbaar in de zettraining.</p>
                      {evalError && <div className="explorer-message" role="status">{evalError}</div>}
                      {evalResult && evalFen === game.fen() && (
                        <>
                          <div className="engine-meta">Diepte {evalResult.depth} · {(evalResult.knodes / 1000).toFixed(1)} miljoen knopen</div>
                          <div className="engine-lines">
                            {evalResult.pvs.map((pv, index) => (
                              <div className="engine-line" key={index}>
                                <strong>{pv.mate !== undefined ? `Mat in ${pv.mate}` : `${((pv.cp ?? 0) / 100).toFixed(2)} pion`}</strong>
                                <span>{formatPv(pv.moves) || pv.moves}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <a className="explorer-link" href={'https://lichess.org/analysis/' + encodeURIComponent(game.fen())} target="_blank" rel="noreferrer">Open Lichess-analyse en start Stockfish <ChevronRight size={14} /></a>
                    </section>
                    <div className="note-box">
                      <div className="note-title">
                        <BookOpen size={16} /> Plan & notities
                      </div>
                      <p>
                        {current.note ||
                          'Voeg ideeën en aandachtspunten toe aan deze variant.'}
                      </p>
                      <div className="note-meta">
                        <span>
                          <Settings2 size={14} /> {current.seen} keer getraind
                        </span>
                        <span>{current.tags.join(' · ')}</span>
                      </div>
                    </div>
                    <section className="move-plans-panel">
                      <div className="eyebrow">BEGRIJP DE OPENING</div>
                      <h3>Waarom speel je deze zetten?</h3>
                      <p className="explorer-description">Per zet zie je het directe idee en het grotere plan. De uitleg is gekoppeld aan de bekende voorbeeldvarianten; afwijkingen op het bord veranderen soms de beste plannen.</p>
                      {openingMovePlans[current.id] ? (
                        <ol className="move-plans-list">
                          {openingMovePlans[current.id].map((item, index) => (
                            <li key={current.id + '-' + index}>
                              <strong>{item.move}</strong>
                              <p>{item.plan}</p>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="explorer-description">Voor deze eigen variant is nog geen vaste zet-voor-zet-uitleg beschikbaar. Voeg het strategische plan toe bij Plan & notities.</p>
                      )}
                    </section>
                  </div>
                )}
              </div>
              {showAdd && (
                <div className="modal-backdrop">
                  <form
                    className="modal"
                    onSubmit={e => {
                      e.preventDefault();
                      saveLine();
                    }}
                  >
                    <div className="modal-heading">
                      <div>
                        <h2>Variant bouwen</h2>
                        <p>Voor een nieuwe variant kun je het bord direct hieronder gebruiken. Geef je lijn een naam en sla de zetten op; je hoeft geen bestaande opening te installeren.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setShowAdd(false)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <label>
                      Naam van de variant
                      <input
                        required
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Bijv. Schots — 4...Nf6"
                      />
                    </label>
                    <label>
                      Voor welke kleur?
                      <select
                        value={newColor}
                        onChange={e =>
                          setNewColor(e.target.value as 'Wit' | 'Zwart')
                        }
                      >
                        <option>Wit</option>
                        <option>Zwart</option>
                      </select>
                    </label>
                    <div className="builder-import-panel">
                      <div className="builder-import-heading">
                        <strong>Zetten vanaf het bord overnemen</strong>
                        <span>De huidige stelling en gespeelde zetten worden als variant opgeslagen.</span>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          const pgn = game.pgn();
                          if (!game.history().length) {
                            setNotice('Speel eerst zetten op het bord of voer hieronder een variant in.');
                            return;
                          }
                          setNewMoves(pgn);
                          if (!newName.trim()) setNewName('Eigen variant — ' + game.history().slice(0, 6).join(' '));
                          setNotice('Zetten van het bord overgenomen. Controleer de naam en sla de variant op.');
                        }}
                      >
                        <Plus size={16} /> Huidige bordlijn overnemen
                      </button>
                    </div>
                    <label>
                      PGN / zetten
                      <textarea
                        rows={3}
                        value={newMoves}
                        onChange={e => setNewMoves(e.target.value)}
                        placeholder="Speel zetten op het bord of plak PGN, bijvoorbeeld: 1. e4 c5 2. Nf3 d6"
                      />
                    </label>
                    <label>
                      Plannen en notities
                      <textarea
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        placeholder="Wat is je plan? Waar moet je op letten?"
                      />
                    </label>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setShowAdd(false)}
                      >
                        Annuleren
                      </button>
                      <button className="primary" type="submit">
                        <Plus size={16} /> Variant opslaan
                      </button>
                    </div>
                  </form>
                </div>
              )}
              {showPgn && (
                <div className="modal-backdrop">
                  <form
                    className="modal"
                    onSubmit={e => {
                      e.preventDefault();
                      importPgn();
                    }}
                  >
                    <div className="modal-heading">
                      <div>
                        <h2>PGN importeren</h2>
                        <p>Plak de PGN van een partij of openingslijn.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setShowPgn(false)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <label>
                      Kleur van het geïmporteerde repertoire
                      <select value={pgnColor} onChange={e => setPgnColor(e.target.value as 'Wit' | 'Zwart')}>
                        <option value="Wit">Wit</option>
                        <option value="Zwart">Zwart</option>
                      </select>
                    </label>
                    <label>
                      PGN
                      <textarea
                        required
                        rows={8}
                        value={pgnInput}
                        onChange={e => setPgnInput(e.target.value)}
                        placeholder={
                          '[Event "Mijn partij"]\n\n1. e4 e5 2. Nf3 Nc6 *'
                        }
                      />
                    </label>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setShowPgn(false)}
                      >
                        Annuleren
                      </button>
                      <button className="primary" type="submit">
                        <Upload size={16} /> Importeren
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
          {tab === 'trainen' && (
            <div className="training-view">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ACTIEVE HERHALING</div>
                  <h1>Zettraining</h1>
                  <p>
                    Haal je openingskennis actief op in plaats van alleen te
                    herlezen.
                  </p>
                </div>
                <div className="training-count">
                  <Brain size={20} />
                  <strong>{reviewLines.length}</strong>
                  <span>varianten klaar · {dueCount} te herhalen</span>
                </div>
              </div>
              {review ? (
                <div className="training-layout">
                  <div className="training-card">
                    <div className="training-card-top">
                      <span className="color-tag">
                        {review.color} repertoire
                      </span>
                      <span className="step-count">
                        KAART{' '}
                        {(reviewIndex % Math.max(reviewLines.length, 1)) + 1} /{' '}
                        {reviewLines.length}
                      </span>
                    </div>
                    <div className="training-symbol">♞</div>
                    <h2>{review.name}</h2>
                    <p className="training-prompt">
                      Probeer de zettenreeks hardop of op een bord na te spelen. Noteer voor jezelf ook het plan en de belangrijkste reactie van je tegenstander.
                    </p>
                    <div className="coverage-summary"><strong>Herinneringsdoel</strong><br />Noem de openingszetten in volgorde, leg één strategisch idee uit en bedenk welke tegenzet je repertoire het meest test.</div>
                    <section className="move-entry-panel board-training-panel"><div className="eyebrow">INTERACTIEVE ZETTRAINING</div><p><strong>Speel de repertoirezetten op het bord.</strong> Tegenstanderszetten worden automatisch afgespeeld. Verkeerde zetten worden bijgehouden en krijgen een korte herhaaltermijn.</p>{(() => { let tg: Chess; try { tg = trainingBoardFen === 'start' ? new Chess() : new Chess(trainingBoardFen); } catch { tg = new Chess(); } const ranks = trainingBoardFlip ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1']; const files = trainingBoardFlip ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h']; const glyph: Record<string,string> = {wp:'♙',wn:'♘',wb:'♗',wr:'♖',wq:'♕',wk:'♔',bp:'♟',bn:'♞',bb:'♝',br:'♜',bq:'♛',bk:'♚'}; const targets = trainingSelected ? tg.moves({square:trainingSelected,verbose:true}).map(m=>m.to) : []; return <><div className="training-interactive-board" role="group" aria-label="Zettraining schaakbord">{ranks.flatMap(rank => files.map(file => (file+rank) as Square)).map((sq,index) => { const p=tg.get(sq); return <button type="button" key={sq} aria-label={sq} disabled={trainingComplete} className={'training-square '+((Math.floor(index/8)+index%8)%2?'dark':'light')+(trainingSelected===sq?' selected':'')+(targets.includes(sq)?' legal-target':'')} onClick={() => handleTrainingSquare(sq)}>{p?glyph[p.color+p.type]:targets.includes(sq)?'·':''}</button>; })}</div><div className="move-entry-actions"><button className="secondary" onClick={() => setTrainingBoardFlip(v=>!v)}>Draai bord</button><button className="secondary" onClick={() => prepareBoardTraining(review)}>Herstart training</button></div><p className="training-feedback" role="status">{trainingFeedback}</p><div className="move-entry-actions"><label className="analysis-depth-label">Analyserdiepte <select aria-label="Stockfish analysediepte" value={trainingAnalysisDepth} onChange={event => setTrainingAnalysisDepth(Number(event.target.value))} disabled={trainingEvalLoading}><option value={12}>Snel · 12</option><option value={16}>Normaal · 16</option><option value={20}>Diep · 20</option><option value={24}>Zeer diep · 24</option></select></label><button className="secondary" onClick={() => void analyzeTrainingPosition()} disabled={trainingEvalLoading}>{trainingEvalLoading?'Stockfish analyseert…':'Analyseer deze stelling'}</button></div>{trainingEval && <div className="training-engine-result"><strong>Stockfish · diepte {trainingEval.depth}</strong>{trainingEval.pvs.slice(0,3).map((pv,i)=><p key={i}><b>{pv.mate!==undefined?'Mat in '+pv.mate:( ((pv.cp??0)/100).toFixed(2)+' pionnen')}</b> — {formatPv(pv.moves)}</p>)}</div>}{trainingEvalError && <p className="training-feedback" role="status">{trainingEvalError}</p>}<small>{trainingComplete?'Variant voltooid':('Zet '+(trainingPly+1)+' · '+(tg.turn()==='w'?'Wit':'Zwart')+' aan zet')} · Individuele zetten in geheugen: {Object.keys(moveMemory).filter(k=>k.startsWith(review.id+':')).length}</small></>; })()}</section>
                    {revealed && (
                      <div className="answer-box">
                        <div className="answer-label">ZETTEN</div>
                        <p className="answer-moves">{review.moves}</p>
                        <div className="answer-label">PLAN</div>
                        <p>
                          {review.note ||
                            'Herhaal de zetten en bepaal wat je stukken proberen te bereiken.'}
                        </p>
                      </div>
                    )}
                    <button
                      className="primary reveal-btn"
                      onClick={() => setRevealed(v => !v)}
                    >
                      {revealed ? 'Verberg antwoord' : 'Toon zetten en plan'}
                    </button>
                    {revealed && (
                      <div className="grade-row">
                        <button
                          className="grade-again"
                          onClick={() => trainResult(false)}
                        >
                          Nog niet goed
                        </button>
                        <button
                          className="grade-good"
                          onClick={() => trainResult(true)}
                        >
                          Ik wist het
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="training-side">
                    <div className="side-info">
                      <div className="side-info-icon">
                        <Target size={19} />
                      </div>
                      <div>
                        <strong>Actief herinneren</strong>
                        <p>
                          Probeer de zetten eerst zelf te vinden voordat je het
                          antwoord bekijkt.
                        </p>
                      </div>
                    </div>
                    <div className="side-info">
                      <div className="side-info-icon">
                        <Clock3 size={19} />
                      </div>
                      <div>
                        <strong>Slim herhalen</strong>
                        <p>
                          Varianten die lastig zijn komen eerder terug. Goed
                          beantwoorde varianten krijgen meer tijd.
                        </p>
                      </div>
                    </div>
                    <div className="session-progress">
                      <div>
                        <span>Voortgang van vandaag</span>
                        <b>{totalSeen} herhalingen</b>
                      </div>
                      <div className="progress-track">
                        <div
                          style={{ width: Math.min(100, totalSeen * 8) + '%' }}
                        />
                      </div>
                    </div>
                    <button className="secondary full-width" onClick={() => { setDueIds([]); setReviewIndex(0); setRevealed(false); resetMoveTraining(); }}>Train alleen wat nu aan de beurt is</button>
                    <button className="secondary full-width" onClick={() => { setDueIds(lines.map(line => line.id)); setReviewIndex(0); setRevealed(false); resetMoveTraining(); }}>Train alle varianten</button>
                  </div>
                </div>
              ) : (
                <div className="empty-training">
                  <Brain size={38} />
                  <h2>Geen varianten om te trainen</h2>
                  <p>Voeg eerst een variant toe aan je repertoire.</p>
                  <button
                    className="primary"
                    onClick={() => setTab('repertoire')}
                  >
                    Naar mijn repertoire
                  </button>
                </div>
              )}
            </div>
          )}
          <footer className="footer">
            <span>
              RepertoireLab <span className="footer-dot">·</span> Jouw
              schaakstudieplek
            </span>
            <span>Je repertoire blijft op dit apparaat bewaard.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
export default App;
