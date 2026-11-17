// server/gymAuthorityService.ts
import { createHash as createHash2, randomBytes, randomUUID as randomUUID2 } from "node:crypto";

// hupu-skills/activity.json
var activity_default = {
  activityId: "app_847cdb589a",
  activityName: "\u4F20\u5947\u7403\u9986",
  alias: "\u4F20\u5947\u7403\u9986"
};

// src/game/types.ts
var statKeys = ["three", "mid", "drive", "inside", "handle", "defense"];

// src/game/config.ts
var statLabels = { three: "\u4E09\u5206", mid: "\u4E2D\u6295", drive: "\u7A81\u7834", inside: "\u7BEE\u4E0B", handle: "\u63A7\u7403", defense: "\u9632\u5B88" };

// src/game/specialistTemplates.ts
var rows = [
  ["shannon-brown", "\u9999\u519C\xB7\u5E03\u6717", "Shannon Brown", "rotation", "SG", 178, 201, [65, 50, 88, 86, 55, 45], "\u51B2\u7B50\u7EC8\u7ED3"],
  ["corey-maggette", "\u79D1\u91CC\xB7\u9A6C\u76D6\u8482", "Corey Maggette", "starter", "SF", 185, 210, [55, 75, 94, 92, 68, 52], "\u5F3A\u529B\u51B2\u7B50"],
  ["monta-ellis", "\u8499\u5854\xB7\u57C3\u5229\u65AF", "Monta Ellis", "starter", "SG", 178, 201, [62, 88, 96, 70, 88, 48], "\u4E2D\u6295\u7A81\u51FB"],
  ["al-jefferson", "\u827E\u5C14\xB7\u6770\u5F17\u68EE", "Al Jefferson", "star", "C", 198, 218, [10, 92, 42, 97, 44, 68], "\u4F4E\u4F4D\u6280\u672F"],
  ["andre-miller", "\u5B89\u5FB7\u70C8\xB7\u7C73\u52D2", "Andre Miller", "starter", "PG", 178, 201, [25, 86, 68, 80, 96, 64], "\u80CC\u8EAB\u7EC4\u7EC7"],
  ["steve-francis", "\u53F2\u8482\u592B\xB7\u5F17\u6717\u897F\u65AF", "Steve Francis", "starter", "PG", 178, 201, [60, 70, 97, 83, 96, 58], "\u6301\u7403\u7A81\u51FB"],
  ["boris-diaw", "\u9C8D\u91CC\u65AF\xB7\u8FEA\u5965", "Boris Diaw", "starter", "PF", 193, 213, [55, 65, 58, 86, 92, 72], "\u950B\u7EBF\u7B56\u5E94"],
  ["greg-monroe", "\u683C\u96F7\u683C\xB7\u95E8\u7F57", "Greg Monroe", "starter", "C", 203, 218, [12, 65, 52, 92, 82, 58], "\u4F4E\u4F4D\u7B56\u5E94"],
  ["lamar-odom", "\u62C9\u9A6C\u5C14\xB7\u5965\u591A\u59C6", "Lamar Odom", "starter", "PF", 198, 218, [65, 67, 91, 82, 94, 72], "\u957F\u4EBA\u6301\u7403"],
  ["hedo-turkoglu", "\u5E0C\u5EA6\xB7\u7279\u79D1\u683C\u9C81", "Hedo Turkoglu", "starter", "SF", 198, 218, [84, 91, 74, 64, 94, 56], "\u9AD8\u4F4D\u7EC4\u7EC7"],
  ["toni-kukoc", "\u6258\u5C3C\xB7\u5E93\u79D1\u5947", "Toni Kukoc", "starter", "SF", 198, 218, [91, 90, 72, 75, 92, 57], "\u9AD8\u4E2A\u6295\u5C04\u7EC4\u7EC7"],
  ["rashard-lewis", "\u62C9\u6C99\u5FB7\xB7\u5218\u6613\u65AF", "Rashard Lewis", "starter", "PF", 198, 218, [94, 77, 75, 90, 52, 55], "\u7A7A\u95F4\u7EC8\u7ED3"],
  ["michael-beasley", "\u8FC8\u514B\u5C14\xB7\u6BD4\u65AF\u5229", "Michael Beasley", "starter", "PF", 193, 218, [60, 94, 95, 84, 66, 48], "\u9AD8\u4E2A\u5355\u6253"],
  ["amare-stoudemire", "\u963F\u739B\u96F7\xB7\u65AF\u5854\u5FB7\u8FC8\u5C14", "Amare Stoudemire", "star", "C", 198, 218, [15, 84, 97, 99, 56, 64], "\u957F\u4EBA\u51B2\u7B50"],
  ["joakim-noah", "\u4E54\u91D1\xB7\u8BFA\u963F", "Joakim Noah", "star", "C", 200, 218, [10, 32, 53, 80, 88, 98], "\u9632\u5B88\u7B56\u5E94"],
  ["porzingis", "\u514B\u91CC\u65AF\u5854\u666E\u65AF\xB7\u6CE2\u5C14\u6D25\u5409\u65AF", "Kristaps Porzingis", "star", "C", 208, 218, [89, 88, 49, 91, 37, 97], "\u6295\u5C04\u62A4\u7B50"],
  ["gallinari", "\u8FBE\u5C3C\u7F57\xB7\u52A0\u91CC\u7EB3\u5229", "Danilo Gallinari", "starter", "SF", 198, 218, [92, 82, 89, 77, 72, 52], "\u9AD8\u4E2A\u6301\u7403\u6295\u5C04"],
  ["jonathan-isaac", "\u4E54\u7EB3\u68EE\xB7\u827E\u8428\u514B", "Jonathan Isaac", "starter", "PF", 200, 218, [55, 52, 86, 76, 48, 96], "\u673A\u52A8\u9501\u9632"],
  ["eric-gordon", "\u57C3\u91CC\u514B\xB7\u6208\u767B", "Eric Gordon", "starter", "SG", 178, 201, [91, 70, 82, 90, 65, 52], "\u6295\u5C04\u7EC8\u7ED3"]
];
var specialistTemplates = rows.map(([id2, name, englishName, tier, position, min, max, values, style]) => ({ id: id2, name, englishName, tier, position, height: [min, max], stats: Object.fromEntries(statKeys.map((k, i) => [k, values[i]])), style }));
var specialistCores = {
  "shannon-brown": [["drive", "inside"]],
  "corey-maggette": [["drive", "inside"]],
  "monta-ellis": [["mid", "drive"]],
  "al-jefferson": [["mid", "inside"]],
  "andre-miller": [["mid", "handle"], ["mid", "inside"]],
  "steve-francis": [["drive", "handle"]],
  "boris-diaw": [["inside", "handle"]],
  "greg-monroe": [["inside", "handle"]],
  "lamar-odom": [["drive", "handle"]],
  "hedo-turkoglu": [["mid", "handle"]],
  "toni-kukoc": [["three", "mid"], ["three", "handle"]],
  "rashard-lewis": [["three", "inside"]],
  "michael-beasley": [["mid", "drive"]],
  "amare-stoudemire": [["drive", "inside"]],
  "joakim-noah": [["handle", "defense"]],
  "porzingis": [["three", "defense"], ["mid", "defense"]],
  "gallinari": [["three", "drive"]],
  "jonathan-isaac": [["drive", "defense"]],
  "eric-gordon": [["three", "inside"]],
  gordon: [["drive", "inside"]],
  derozan: [["mid", "drive"]],
  aldridge: [["mid", "inside"]],
  livingston: [["mid", "handle"]],
  "derrick-rose": [["drive", "handle"]],
  jokic: [["inside", "handle"]],
  rondo: [["inside", "handle"]],
  "ray-allen": [["three", "mid"]],
  "reggie-miller": [["three", "mid"]],
  "pau-gasol": [["mid", "inside"]]
};
var matureSpecialistCores = {
  "seth-curry": [["three", "mid"]],
  "jose-calderon": [["three", "handle"]],
  kemba: [["three", "drive"]],
  "gilbert-arenas": [["three", "drive"]],
  beverley: [["three", "defense"]],
  caruso: [["three", "defense"]],
  jrue: [["mid", "defense"], ["drive", "defense"], ["inside", "defense"]],
  butler: [["mid", "defense"]],
  "shawn-marion": [["inside", "defense"]],
  capela: [["inside", "defense"]],
  rubio: [["handle", "defense"]],
  draymond: [["handle", "defense"]]
};

// src/game/extraTemplates.ts
var group = (tier, rows2) => rows2.map(([id2, name, englishName, position, min, max, values, style]) => ({ id: id2, name, englishName, position, tier, height: [min, max], stats: Object.fromEntries(statKeys.map((k, i) => [k, values[i]])), style }));
var originalTemplates = [
  ...group("rotation", [
    ["korver", "\u51EF\u5C14\xB7\u79D1\u6C83\u5C14", "Kyle Korver", "SG", 188, 207, [96, 72, 29, 35, 40, 55], "\u5B9A\u70B9\u72D9\u51FB"],
    ["redick", "JJ\xB7\u96F7\u8FEA\u514B", "JJ Redick", "SG", 180, 198, [93, 80, 39, 31, 55, 40], "\u8DD1\u52A8\u6295\u5C04"],
    ["tony-allen", "\u6258\u5C3C\xB7\u963F\u4F26", "Tony Allen", "SG", 185, 201, [28, 41, 65, 62, 45, 96], "\u5916\u7EBF\u5C01\u9501"],
    ["battier", "\u8096\u6069\xB7\u5DF4\u8482\u5C14", "Shane Battier", "SF", 193, 212, [76, 48, 34, 51, 39, 91], "\u56E2\u961F\u9632\u5B88"],
    ["bowen", "\u5E03\u9C81\u65AF\xB7\u9C8D\u6587", "Bruce Bowen", "SF", 188, 207, [70, 38, 25, 40, 31, 95], "\u5E95\u89D2\u9501\u9632"],
    ["patty-mills", "\u5E15\u8482\xB7\u7C73\u5C14\u65AF", "Patty Mills", "PG", 178, 192, [83, 63, 58, 35, 73, 44], "\u5FEB\u8282\u594F\u5C04\u624B"],
    ["dell-curry", "\u6234\u5C14\xB7\u5E93\u91CC", "Dell Curry", "SG", 183, 202, [88, 82, 46, 34, 49, 50], "\u53CC\u533A\u6295\u624B"],
    ["livingston", "\u8096\u6069\xB7\u5229\u6587\u65AF\u987F", "Shaun Livingston", "PG", 190, 209, [25, 91, 59, 72, 80, 68], "\u9AD8\u4E2A\u4E2D\u6295"],
    ["haslem", "\u72B9\u591A\u5C3C\u65AF\xB7\u54C8\u65AF\u52D2\u59C6", "Udonis Haslem", "PF", 195, 214, [12, 63, 28, 69, 30, 82], "\u5185\u7EBF\u62FC\u640F"],
    ["birdman", "\u514B\u91CC\u65AF\xB7\u5B89\u5FB7\u68EE", "Chris Andersen", "C", 200, 218, [18, 24, 48, 84, 20, 89], "\u5F39\u8DF3\u62A4\u7B50"],
    ["steven-adams", "\u53F2\u8482\u6587\xB7\u4E9A\u5F53\u65AF", "Steven Adams", "C", 203, 218, [9, 31, 37, 85, 47, 83], "\u5F3A\u529B\u63A9\u62A4"],
    ["danny-green", "\u4E39\u5C3C\xB7\u683C\u6797", "Danny Green", "SG", 185, 205, [84, 49, 36, 46, 42, 86], "\u4E09\u5206\u534F\u9632"],
    ["joe-harris", "\u4E54\xB7\u54C8\u91CC\u65AF", "Joe Harris", "SF", 188, 207, [92, 60, 48, 51, 44, 48], "\u7A7A\u95F4\u6295\u624B"],
    ["jose-calderon", "\u4F55\u585E\xB7\u5361\u5C14\u5FB7\u9686", "Jose Calderon", "PG", 178, 199, [81, 74, 43, 32, 88, 35], "\u7A33\u5B9A\u63A7\u573A"]
  ]),
  ...group("starter", [
    ["jrue", "\u6731\xB7\u970D\u52D2\u8FEA", "Jrue Holiday", "PG", 178, 201, [74, 69, 73, 65, 82, 96], "\u540E\u573A\u94C1\u95F8"],
    ["rondo", "\u62C9\u7B80\xB7\u9686\u591A", "Rajon Rondo", "PG", 178, 198, [37, 48, 77, 64, 97, 85], "\u4F20\u7403\u6307\u6325"],
    ["rubio", "\u91CC\u57FA\xB7\u5362\u6BD4\u5965", "Ricky Rubio", "PG", 178, 201, [47, 61, 58, 42, 95, 80], "\u89C6\u91CE\u7EC4\u7EC7"],
    ["lowry", "\u51EF\u5C14\xB7\u6D1B\u745E", "Kyle Lowry", "PG", 178, 195, [83, 65, 73, 58, 84, 87], "\u575A\u97E7\u540E\u536B"],
    ["kemba", "\u80AF\u5DF4\xB7\u6C83\u514B", "Kemba Walker", "PG", 178, 193, [86, 82, 89, 51, 93, 43], "\u53D8\u5411\u5F97\u5206"],
    ["lou-williams", "\u8DEF\u6613\u65AF\xB7\u5A01\u5EC9\u59C6\u65AF", "Lou Williams", "SG", 178, 195, [78, 87, 85, 55, 88, 35], "\u66FF\u8865\u706B\u529B"],
    ["jason-terry", "\u6770\u68EE\xB7\u7279\u91CC", "Jason Terry", "SG", 178, 199, [88, 84, 61, 43, 77, 58], "\u5173\u952E\u6295\u5C04"],
    ["ariza", "\u7279\u96F7\u6C83\xB7\u963F\u91CC\u624E", "Trevor Ariza", "SF", 193, 212, [73, 43, 67, 66, 51, 91], "\u4FA7\u7FFC\u62E6\u622A"],
    ["iguodala", "\u5B89\u5FB7\u70C8\xB7\u4F0A\u6208\u8FBE\u62C9", "Andre Iguodala", "SF", 190, 210, [57, 59, 87, 82, 85, 95], "\u5168\u80FD\u8FDE\u63A5"],
    ["shawn-marion", "\u8096\u6069\xB7\u9A6C\u91CC\u6602", "Shawn Marion", "PF", 193, 214, [55, 48, 82, 91, 54, 96], "\u8FD0\u52A8\u950B\u7EBF"],
    ["millsap", "\u4FDD\u7F57\xB7\u7C73\u5C14\u8428\u666E", "Paul Millsap", "PF", 193, 214, [62, 73, 65, 86, 62, 88], "\u5185\u7EBF\u5168\u80FD"],
    ["ibaka", "\u8D5B\u5C14\u5409\xB7\u4F0A\u5DF4\u5361", "Serge Ibaka", "PF", 200, 218, [66, 78, 37, 84, 28, 96], "\u6295\u5C04\u5C01\u76D6"],
    ["deandre-jordan", "\u5FB7\u5B89\u5FB7\u70C8\xB7\u4E54\u4E39", "DeAndre Jordan", "C", 203, 218, [5, 15, 48, 98, 23, 91], "\u66B4\u529B\u7A7A\u63A5"],
    ["valanciunas", "\u7EA6\u7EB3\u65AF\xB7\u74E6\u5170\u4E18\u7EB3\u65AF", "Jonas Valanciunas", "C", 203, 218, [43, 66, 34, 95, 40, 75], "\u4F4E\u4F4D\u5F3A\u653B"]
  ]),
  ...group("star", [
    ["trae", "\u7279\u96F7\xB7\u6768", "Trae Young", "PG", 178, 195, [94, 83, 85, 47, 97, 28], "\u8FDC\u6295\u63A7\u573A"],
    ["derrick-rose", "\u5FB7\u91CC\u514B\xB7\u7F57\u65AF", "Derrick Rose", "PG", 178, 199, [59, 81, 99, 86, 96, 64], "\u7206\u53D1\u7A81\u51FB"],
    ["tony-parker", "\u6258\u5C3C\xB7\u5E15\u514B", "Tony Parker", "PG", 178, 198, [51, 89, 96, 88, 93, 59], "\u9AD8\u901F\u629B\u6295"],
    ["gilbert-arenas", "\u5409\u5C14\u4F2F\u7279\xB7\u963F\u91CC\u7EB3\u65AF", "Gilbert Arenas", "PG", 178, 201, [91, 82, 94, 71, 90, 46], "\u540E\u573A\u706B\u529B"],
    ["booker", "\u5FB7\u6587\xB7\u5E03\u514B", "Devin Booker", "SG", 185, 207, [86, 97, 84, 77, 83, 62], "\u4E2D\u8DDD\u79BB\u6838\u5FC3"],
    ["donovan-mitchell", "\u591A\u8BFA\u4E07\xB7\u7C73\u5207\u5C14", "Donovan Mitchell", "SG", 178, 201, [88, 78, 96, 83, 92, 72], "\u51B2\u51FB\u5F97\u5206"],
    ["bradley-beal", "\u5E03\u62C9\u5FB7\u5229\xB7\u6BD4\u5C14", "Bradley Beal", "SG", 183, 204, [85, 94, 89, 69, 85, 54], "\u6D41\u7545\u5F97\u5206"],
    ["derozan", "\u5FB7\u9A6C\u5C14\xB7\u5FB7\u7F57\u8D5E", "DeMar DeRozan", "SF", 188, 210, [41, 99, 92, 87, 81, 62], "\u4E2D\u6295\u827A\u672F"],
    ["grant-hill", "\u683C\u5170\u7279\xB7\u5E0C\u5C14", "Grant Hill", "SF", 193, 213, [66, 86, 96, 83, 94, 86], "\u5168\u80FD\u7A81\u7834"],
    ["peja", "\u4F69\u8D3E\xB7\u65AF\u6258\u4E9A\u79D1\u7EF4\u5947", "Peja Stojakovic", "SF", 195, 214, [98, 90, 46, 50, 56, 57], "\u9AD8\u70B9\u5C04\u624B"],
    ["kevin-love", "\u51EF\u6587\xB7\u4E50\u798F", "Kevin Love", "PF", 198, 218, [90, 77, 42, 86, 61, 62], "\u7A7A\u95F4\u5185\u7EBF"],
    ["aldridge", "\u62C9\u9A6C\u5E93\u65AF\xB7\u963F\u5C14\u5FB7\u91CC\u5947", "LaMarcus Aldridge", "PF", 200, 218, [39, 98, 48, 93, 46, 78], "\u7FFB\u8EAB\u4E2D\u6295"],
    ["chris-bosh", "\u514B\u91CC\u65AF\xB7\u6CE2\u4EC0", "Chris Bosh", "PF", 200, 218, [62, 94, 70, 92, 61, 86], "\u673A\u52A8\u5185\u7EBF"],
    ["ben-wallace", "\u672C\xB7\u534E\u83B1\u58EB", "Ben Wallace", "C", 195, 215, [5, 18, 35, 72, 21, 99], "\u9632\u5B88\u5821\u5792"]
  ]),
  ...group("superstar", [
    ["lillard", "\u8FBE\u7C73\u5B89\xB7\u5229\u62C9\u5FB7", "Damian Lillard", "PG", 178, 199, [99, 87, 92, 67, 96, 47], "\u8D85\u8FDC\u7206\u53D1"],
    ["chris-paul", "\u514B\u91CC\u65AF\xB7\u4FDD\u7F57", "Chris Paul", "PG", 178, 195, [86, 98, 84, 68, 99, 93], "\u7CBE\u5BC6\u6307\u6325"],
    ["westbrook", "\u62C9\u585E\u5C14\xB7\u5A01\u65AF\u5E03\u9C81\u514B", "Russell Westbrook", "PG", 178, 201, [55, 73, 99, 93, 97, 78], "\u51B2\u51FB\u53D1\u52A8\u673A"],
    ["harden", "\u8A79\u59C6\u65AF\xB7\u54C8\u767B", "James Harden", "SG", 183, 207, [96, 80, 98, 86, 99, 58], "\u6301\u7403\u521B\u9020"],
    ["wade", "\u5FB7\u7EF4\u6069\xB7\u97E6\u5FB7", "Dwyane Wade", "SG", 183, 205, [48, 93, 99, 96, 95, 94], "\u95EA\u7535\u7A81\u7834"],
    ["iverson", "\u963F\u4F26\xB7\u827E\u5F17\u68EE", "Allen Iverson", "SG", 178, 193, [75, 94, 99, 85, 99, 74], "\u7075\u5DE7\u7A81\u51FB"],
    ["mcgrady", "\u7279\u96F7\u897F\xB7\u9EA6\u514B\u683C\u96F7\u8FEA", "Tracy McGrady", "SG", 190, 213, [91, 96, 98, 88, 96, 79], "\u5929\u8D4B\u5F97\u5206"],
    ["vince-carter", "\u6587\u65AF\xB7\u5361\u7279", "Vince Carter", "SG", 185, 208, [91, 88, 97, 99, 84, 77], "\u98DE\u5929\u7EC8\u7ED3"],
    ["paul-pierce", "\u4FDD\u7F57\xB7\u76AE\u5C14\u65AF", "Paul Pierce", "SF", 190, 213, [91, 96, 84, 85, 86, 83], "\u8282\u594F\u5F97\u5206"],
    ["carmelo", "\u5361\u6885\u9686\xB7\u5B89\u4E1C\u5C3C", "Carmelo Anthony", "SF", 193, 213, [89, 99, 86, 91, 81, 61], "\u950B\u7EBF\u5355\u6253"],
    ["nowitzki", "\u5FB7\u514B\xB7\u8BFA\u7EF4\u8328\u57FA", "Dirk Nowitzki", "PF", 200, 218, [95, 99, 66, 90, 77, 67], "\u91D1\u9E21\u72EC\u7ACB"],
    ["pau-gasol", "\u4FDD\u7F57\xB7\u52A0\u7D22\u5C14", "Pau Gasol", "PF", 200, 218, [48, 92, 62, 98, 83, 89], "\u6280\u672F\u5185\u7EBF"],
    ["embiid", "\u4E54\u5C14\xB7\u6069\u6BD4\u5FB7", "Joel Embiid", "C", 203, 218, [78, 99, 76, 99, 75, 96], "\u5168\u57DF\u4E2D\u950B"],
    ["anthony-davis", "\u5B89\u4E1C\u5C3C\xB7\u6234\u7EF4\u65AF", "Anthony Davis", "PF", 198, 218, [59, 89, 88, 99, 72, 99], "\u673A\u52A8\u7EDF\u6CBB"]
  ]),
  ...group("legend", [
    ["oscar", "\u5965\u65AF\u5361\xB7\u7F57\u4F2F\u7279\u68EE", "Oscar Robertson", "PG", 178, 204, [82, 98, 96, 91, 99, 89], "\u5168\u80FD\u540E\u573A"],
    ["isiah", "\u4F0A\u8D5B\u4E9A\xB7\u6258\u9A6C\u65AF", "Isiah Thomas", "PG", 178, 195, [75, 91, 97, 84, 99, 92], "\u5F3A\u97E7\u63A7\u573A"],
    ["stockton", "\u7EA6\u7FF0\xB7\u65AF\u6258\u514B\u987F", "John Stockton", "PG", 178, 198, [90, 88, 79, 64, 99, 98], "\u52A9\u653B\u5927\u5E08"],
    ["jerry-west", "\u6770\u91CC\xB7\u97E6\u65AF\u7279", "Jerry West", "SG", 180, 203, [92, 99, 86, 74, 94, 96], "\u7CBE\u51C6\u540E\u536B"],
    ["ray-allen", "\u96F7\xB7\u963F\u4F26", "Ray Allen", "SG", 183, 207, [99, 91, 76, 68, 80, 75], "\u5386\u53F2\u7EA7\u6295\u5C04"],
    ["reggie-miller", "\u96F7\u5409\xB7\u7C73\u52D2", "Reggie Miller", "SG", 190, 211, [99, 92, 62, 55, 64, 73], "\u65E0\u7403\u6740\u624B"],
    ["bird", "\u62C9\u91CC\xB7\u4F2F\u5FB7", "Larry Bird", "SF", 195, 215, [98, 99, 74, 86, 93, 91], "\u950B\u7EBF\u6307\u6325"],
    ["erving", "\u6731\u5229\u53F6\u65AF\xB7\u6B27\u6587", "Julius Erving", "SF", 190, 213, [61, 88, 99, 98, 87, 93], "\u98DE\u7FD4\u950B\u7EBF"],
    ["pippen", "\u65AF\u79D1\u8482\xB7\u76AE\u84EC", "Scottie Pippen", "SF", 193, 214, [78, 82, 95, 89, 96, 99], "\u5168\u80FD\u9501\u9632"],
    ["garnett", "\u51EF\u6587\xB7\u52A0\u5185\u7279", "Kevin Garnett", "PF", 200, 218, [47, 97, 80, 95, 85, 99], "\u94C1\u8840\u5168\u80FD"],
    ["karl-malone", "\u5361\u5C14\xB7\u9A6C\u9F99", "Karl Malone", "PF", 198, 218, [31, 94, 77, 99, 62, 91], "\u529B\u91CF\u7EC8\u7ED3"],
    ["hakeem", "\u54C8\u57FA\u59C6\xB7\u5965\u62C9\u6731\u65FA", "Hakeem Olajuwon", "C", 200, 218, [21, 93, 85, 99, 78, 99], "\u68A6\u5E7B\u811A\u6B65"],
    ["kareem", "\u5361\u91CC\u59C6\xB7\u963F\u535C\u675C\u5C14\u8D3E\u5DF4\u5C14", "Kareem Abdul-Jabbar", "C", 205, 218, [9, 86, 55, 99, 65, 96], "\u5929\u52FE\u5927\u5E08"],
    ["wilt", "\u5A01\u5C14\u7279\xB7\u5F20\u4F2F\u4F26", "Wilt Chamberlain", "C", 205, 218, [5, 59, 88, 99, 59, 99], "\u7981\u533A\u5DE8\u517D"]
  ])
];
var adjustedTiers = { "ray-allen": "superstar", "reggie-miller": "superstar", pippen: "superstar", "pau-gasol": "star" };
var extraTemplates = originalTemplates.map((t) => ({ ...t, tier: adjustedTiers[t.id] ?? t.tier }));

// src/game/templates.ts
var stats = (three, mid, drive, inside, handle, defense) => ({ three, mid, drive, inside, handle, defense });
var nbaTemplates = [
  { id: "caruso", name: "\u4E9A\u5386\u514B\u65AF\xB7\u5361\u9C81\u7D22", englishName: "Alex Caruso", tier: "rotation", position: "SG", height: [185, 201], stats: stats(61, 45, 62, 55, 65, 88), style: "\u5916\u7EBF\u9632\u5B88" },
  { id: "beverley", name: "\u5E15\u7279\u91CC\u514B\xB7\u8D1D\u5F17\u5229", englishName: "Patrick Beverley", tier: "rotation", position: "PG", height: [178, 193], stats: stats(62, 42, 45, 38, 66, 85), style: "\u538B\u8FEB\u9632\u5B88" },
  { id: "duncan-robinson", name: "\u9093\u80AF\xB7\u7F57\u5BBE\u900A", englishName: "Duncan Robinson", tier: "rotation", position: "SG", height: [190, 207], stats: stats(90, 55, 42, 40, 48, 45), style: "\u65E0\u7403\u5C04\u624B" },
  { id: "seth-curry", name: "\u585E\u65AF\xB7\u5E93\u91CC", englishName: "Seth Curry", tier: "rotation", position: "SG", height: [178, 195], stats: stats(87, 70, 49, 40, 64, 43), style: "\u7CBE\u51C6\u6295\u5C04" },
  { id: "tucker", name: "PJ\xB7\u5854\u514B", englishName: "PJ Tucker", tier: "rotation", position: "PF", height: [190, 208], stats: stats(66, 33, 30, 57, 32, 88), style: "\u5E95\u89D2\u4E0E\u9632\u5B88" },
  { id: "mcgee", name: "\u8D3E\u7EF4\u5C14\xB7\u9EA6\u57FA", englishName: "JaVale McGee", tier: "rotation", position: "C", height: [203, 218], stats: stats(15, 28, 42, 88, 26, 75), style: "\u7BEE\u4E0B\u7EC8\u7ED3" },
  { id: "conley", name: "\u8FC8\u514B\xB7\u5EB7\u5229", englishName: "Mike Conley", tier: "starter", position: "PG", height: [178, 195], stats: stats(79, 77, 76, 61, 87, 74), style: "\u7A33\u5065\u7EC4\u7EC7" },
  { id: "mccollum", name: "CJ\xB7\u9EA6\u79D1\u52D2\u59C6", englishName: "CJ McCollum", tier: "starter", position: "SG", height: [180, 198], stats: stats(85, 90, 80, 63, 87, 53), style: "\u6280\u672F\u578B\u5F97\u5206" },
  { id: "brook-lopez", name: "\u5E03\u9C81\u514B\xB7\u6D1B\u4F69\u65AF", englishName: "Brook Lopez", tier: "starter", position: "C", height: [205, 218], stats: stats(75, 60, 35, 85, 35, 88), style: "\u7A7A\u95F4\u62A4\u7B50" },
  { id: "capela", name: "\u514B\u6797\u7279\xB7\u5361\u4F69\u62C9", englishName: "Clint Capela", tier: "starter", position: "C", height: [200, 218], stats: stats(12, 28, 52, 91, 35, 86), style: "\u7A7A\u63A5\u62A4\u7B50" },
  { id: "gordon", name: "\u963F\u9686\xB7\u6208\u767B", englishName: "Aaron Gordon", tier: "starter", position: "PF", height: [193, 213], stats: stats(60, 58, 88, 90, 63, 79), style: "\u7206\u53D1\u7EC8\u7ED3" },
  { id: "harris", name: "\u6258\u62DC\u5384\u65AF\xB7\u54C8\u91CC\u65AF", englishName: "Tobias Harris", tier: "starter", position: "SF", height: [190, 210], stats: stats(77, 83, 73, 77, 67, 64), style: "\u950B\u7EBF\u5F97\u5206" },
  { id: "irving", name: "\u51EF\u91CC\xB7\u6B27\u6587", englishName: "Kyrie Irving", tier: "star", position: "PG", height: [178, 198], stats: stats(90, 94, 97, 81, 99, 53), style: "\u63A7\u7403\u5927\u5E08" },
  { id: "paul-george", name: "\u4FDD\u7F57\xB7\u4E54\u6CBB", englishName: "Paul George", tier: "star", position: "SF", height: [193, 213], stats: stats(88, 87, 87, 78, 85, 92), style: "\u653B\u5B88\u950B\u7EBF" },
  { id: "butler", name: "\u5409\u7C73\xB7\u5DF4\u7279\u52D2", englishName: "Jimmy Butler", tier: "star", position: "SF", height: [190, 211], stats: stats(60, 86, 93, 88, 83, 95), style: "\u5F3A\u786C\u7A81\u7834" },
  { id: "thompson", name: "\u514B\u83B1\xB7\u6C64\u666E\u68EE", englishName: "Klay Thompson", tier: "star", position: "SG", height: [188, 207], stats: stats(97, 88, 61, 60, 59, 86), style: "\u9876\u7EA7\u65E0\u7403\u6295\u5C04" },
  { id: "draymond", name: "\u5FB7\u96F7\u8499\u5FB7\xB7\u683C\u6797", englishName: "Draymond Green", tier: "star", position: "PF", height: [193, 213], stats: stats(51, 43, 62, 74, 81, 98), style: "\u7EC4\u7EC7\u4E0E\u9632\u5B88" },
  { id: "gobert", name: "\u9C81\u8FEA\xB7\u6208\u8D1D\u5C14", englishName: "Rudy Gobert", tier: "star", position: "C", height: [205, 218], stats: stats(10, 22, 40, 94, 29, 99), style: "\u7981\u533A\u5C4F\u969C" },
  { id: "nash", name: "\u53F2\u8482\u592B\xB7\u7EB3\u4EC0", englishName: "Steve Nash", tier: "superstar", position: "PG", height: [178, 198], stats: stats(94, 93, 85, 65, 98, 49), style: "\u6295\u5C04\u7EC4\u7EC7" },
  { id: "bryant", name: "\u79D1\u6BD4\xB7\u5E03\u83B1\u6069\u7279", englishName: "Kobe Bryant", tier: "legend", position: "SG", height: [185, 207], stats: stats(85, 99, 95, 89, 94, 91), style: "\u5168\u57DF\u5F97\u5206" },
  { id: "durant", name: "\u51EF\u6587\xB7\u675C\u5170\u7279", englishName: "Kevin Durant", tier: "legend", position: "SF", height: [198, 218], stats: stats(95, 99, 91, 88, 89, 83), style: "\u9AD8\u4E2A\u6295\u5C04" },
  { id: "leonard", name: "\u79D1\u6000\xB7\u4F26\u7EB3\u5FB7", englishName: "Kawhi Leonard", tier: "superstar", position: "SF", height: [190, 211], stats: stats(87, 95, 88, 85, 83, 99), style: "\u53CC\u5411\u6838\u5FC3" },
  { id: "antetokounmpo", name: "\u626C\u5C3C\u65AF\xB7\u963F\u5FB7\u6258\u6606\u535A", englishName: "Giannis Antetokounmpo", tier: "superstar", position: "PF", height: [198, 218], stats: stats(54, 68, 99, 99, 87, 96), style: "\u51B2\u51FB\u7981\u533A" },
  { id: "jokic", name: "\u5C3C\u53E4\u62C9\xB7\u7EA6\u57FA\u5947", englishName: "Nikola Jokic", tier: "superstar", position: "C", height: [200, 218], stats: stats(83, 91, 75, 98, 97, 75), style: "\u4E2D\u950B\u7EC4\u7EC7" },
  { id: "curry", name: "\u65AF\u8482\u82AC\xB7\u5E93\u91CC", englishName: "Stephen Curry", tier: "legend", position: "PG", height: [178, 198], stats: stats(99, 94, 92, 74, 99, 70), style: "\u8D85\u8FDC\u6295\u5C04" },
  { id: "jordan", name: "\u8FC8\u514B\u5C14\xB7\u4E54\u4E39", englishName: "Michael Jordan", tier: "legend", position: "SG", height: [185, 207], stats: stats(81, 99, 99, 97, 96, 99), style: "\u653B\u5B88\u7EDF\u6CBB" },
  { id: "lebron", name: "\u52D2\u5E03\u6717\xB7\u8A79\u59C6\u65AF", englishName: "LeBron James", tier: "legend", position: "SF", height: [193, 214], stats: stats(91, 94, 98, 99, 97, 96), style: "\u5168\u80FD\u5DE8\u661F" },
  { id: "magic", name: "\u9B54\u672F\u5E08\xB7\u7EA6\u7FF0\u900A", englishName: "Magic Johnson", tier: "legend", position: "PG", height: [195, 214], stats: stats(68, 86, 91, 88, 99, 79), style: "\u9AD8\u4E2A\u63A7\u573A" },
  { id: "duncan", name: "\u8482\u59C6\xB7\u9093\u80AF", englishName: "Tim Duncan", tier: "legend", position: "PF", height: [200, 218], stats: stats(25, 91, 66, 98, 64, 99), style: "\u5185\u7EBF\u57FA\u77F3" },
  { id: "oneal", name: "\u6C99\u594E\u5C14\xB7\u5965\u5C3C\u5C14", englishName: "Shaquille O'Neal", tier: "legend", position: "C", height: [205, 218], stats: stats(5, 38, 77, 99, 48, 94), style: "\u7BEE\u4E0B\u7EDF\u6CBB" },
  ...extraTemplates,
  ...specialistTemplates
];
var templateById = (id2) => nbaTemplates.find((t) => t.id === id2);

// src/game/contract/random.ts
function hash(text2) {
  let h = 2166136261;
  for (let i = 0; i < text2.length; i++) h = Math.imul(h ^ text2.charCodeAt(i), 16777619);
  return h >>> 0;
}
function stream(seed, label) {
  return { state: hash(`${seed}:${label}`) };
}
function random(s) {
  s.state = s.state + 1831565813 >>> 0;
  let t = s.state;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function weighted(s, weights) {
  if (!weights.length || weights.some((w) => !Number.isFinite(w) || w < 0)) throw new Error("\u65E0\u6548\u6743\u91CD");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("\u6743\u91CD\u603B\u548C\u5FC5\u987B\u5927\u4E8E0");
  let roll = random(s) * sum;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

// src/game/contract/runtime/numerical.json
var numerical_default = {
  sword_value: {
    base: 320,
    merchant_base: 640,
    per_level_multiplier: 1.5,
    great_total_value_multiplier: 2.5,
    success_level_delta: 1,
    great_level_delta: 2,
    damage_level_delta: -1,
    minimum_level: 0,
    plain_formula: "round(base*1.5**level)",
    with_relics_approx: "round((effectiveBase*1.5**level+flatBonus)*allMultipliers); must retain extra Great-derived state",
    great_note: "The exact internal storage representation for banked Great premium is not confirmed by the public guide. Do not approximate it by simply changing level."
  },
  tribute: {
    days: [
      {
        day: 1,
        quota: 1800,
        merchant_visit: false
      },
      {
        day: 2,
        quota: 2100,
        merchant_visit: false
      },
      {
        day: 3,
        quota: 2600,
        merchant_visit: true
      },
      {
        day: 4,
        quota: 3350,
        merchant_visit: false
      },
      {
        day: 5,
        quota: 4350,
        merchant_visit: false
      },
      {
        day: 6,
        quota: 5700,
        merchant_visit: true
      },
      {
        day: 7,
        quota: 7500,
        merchant_visit: false
      },
      {
        day: 8,
        quota: 9800,
        merchant_visit: false
      },
      {
        day: 9,
        quota: 12800,
        merchant_visit: true
      },
      {
        day: 10,
        quota: 16700,
        merchant_visit: false
      },
      {
        day: 11,
        quota: 21500,
        merchant_visit: false
      },
      {
        day: 12,
        quota: 27750,
        merchant_visit: true
      },
      {
        day: 13,
        quota: 35700,
        merchant_visit: false
      },
      {
        day: 14,
        quota: 45800,
        merchant_visit: false
      },
      {
        day: 15,
        quota: 58650,
        merchant_visit: true
      },
      {
        day: 16,
        quota: 74650,
        merchant_visit: false
      },
      {
        day: 17,
        quota: 94550,
        merchant_visit: false
      },
      {
        day: 18,
        quota: 119350,
        merchant_visit: true
      },
      {
        day: 19,
        quota: 149950,
        merchant_visit: false
      },
      {
        day: 20,
        quota: 186850,
        merchant_visit: false
      },
      {
        day: 21,
        quota: 232e3,
        merchant_visit: true
      }
    ],
    after_day_21: "previous quota * 1.2 with game-specific rounding; use listed verified values or test rounding",
    after_day_21_known: {
      "22": 278400,
      "23": 334080,
      "24": 400896,
      "25": 481075,
      "26": 577290,
      "27": 692748,
      "28": 831298,
      "29": 997558,
      "30": 1197069,
      "31": 1436483,
      "32": 1723779,
      "33": 2068535,
      "34": 2482242,
      "35": 2978691,
      "36": 3574429,
      "37": 4289315,
      "38": 5147178,
      "39": 6176613,
      "40": 7411936,
      "41": 8894323,
      "42": 10673188,
      "43": 12807825,
      "44": 15369390,
      "45": 18443269,
      "46": 22131922,
      "47": 26558307
    },
    failure_limit: 3,
    gold_from_offered_swords: "all offered value becomes gold even if quota insufficient"
  },
  forging_odds: {
    base_tickets: {
      break: 9,
      damage: 2,
      hold: 5,
      success: 12,
      great: 2
    },
    break_chance_percent_by_level_0_to_30: [
      0,
      1.8,
      5.9,
      12.9,
      24.8,
      29.7,
      34.7,
      38.3,
      41.8,
      44.3,
      46.7,
      49.1,
      50.5,
      51.9,
      53.2,
      54.5,
      55.8,
      57.6,
      59.4,
      61.2,
      63,
      63.9,
      64.8,
      65.7,
      66.6,
      67.5,
      68.4,
      69.3,
      70.2,
      71.1,
      72
    ],
    level_30_plus_break_percent: 72,
    other_outcome_ratio_after_break: [
      "damage=2",
      "hold=5",
      "success=12",
      "great=2"
    ],
    ticket_resolution: 1e3,
    distribution_examples: {
      level_0: {
        break: 0,
        damage: 9.5,
        hold: 23.8,
        success: 57.2,
        great: 9.5
      },
      level_10: {
        break: 46.7,
        damage: 5.1,
        hold: 12.7,
        success: 30.4,
        great: 5.1
      },
      level_30: {
        break: 72,
        damage: 2.7,
        hold: 6.7,
        success: 16,
        great: 2.6
      }
    },
    note: "Rounding to 1,000 tickets uses largest fractional remainders; changing ticket counts changes normalized probabilities"
  },
  frenzy: {
    charge_needed: 10,
    starts_on_next_strike: true,
    base_duration_seconds: 4,
    default_time_between_strikes_seconds: 0.64,
    break_probability_during_frenzy: 0,
    max_strikes_without_speed_relics: 7
  },
  merchant: {
    visit_every_days: 3,
    first_day: 3,
    basic_sword_price_formula: "max(700, round(0.4*quota))",
    basic_sword_stock_by_visit: "2 on first visit, 3 on visits 2/3, 4 on visits 4-7, 5 afterwards",
    repeat_purchase_multiplier: 3,
    item_price_by_visit: {
      "3": {
        basic_sword: 1040,
        special_sword: 2960,
        cracked_dragon_scale: 1100,
        regret_clockwork: 3980,
        red_chalk: null,
        powder_pouch: null,
        cold_star_shard: null,
        incense_of_oblivion: null,
        ghost_delivery_note: null
      },
      "6": {
        basic_sword: 2280,
        special_sword: 6490,
        cracked_dragon_scale: 2400,
        regret_clockwork: 8730,
        red_chalk: 3200,
        powder_pouch: 5130,
        cold_star_shard: 3990,
        incense_of_oblivion: null,
        ghost_delivery_note: 5190
      },
      "9": {
        basic_sword: 5120,
        special_sword: 23300,
        cracked_dragon_scale: 5380,
        regret_clockwork: 19590,
        red_chalk: 7170,
        powder_pouch: 11520,
        cold_star_shard: 8960,
        incense_of_oblivion: 27650,
        ghost_delivery_note: 11650
      },
      "12": {
        basic_sword: 11100,
        special_sword: 50510,
        cracked_dragon_scale: 11660,
        regret_clockwork: 42460,
        red_chalk: 15540,
        powder_pouch: 24980,
        cold_star_shard: 19430,
        incense_of_oblivion: 59940,
        ghost_delivery_note: 25260
      },
      "15": {
        basic_sword: 23460,
        special_sword: 160120,
        cracked_dragon_scale: 24640,
        regret_clockwork: 89740,
        red_chalk: 32850,
        powder_pouch: 52790,
        cold_star_shard: 41060,
        incense_of_oblivion: 126690,
        ghost_delivery_note: 53380
      },
      "18": {
        basic_sword: 47740,
        special_sword: 325830,
        cracked_dragon_scale: 50130,
        regret_clockwork: 182610,
        red_chalk: 66840,
        powder_pouch: 107420,
        cold_star_shard: 83550,
        incense_of_oblivion: 257800,
        ghost_delivery_note: 108610
      },
      "21": {
        basic_sword: 92800,
        special_sword: 633360,
        cracked_dragon_scale: 97440,
        regret_clockwork: 354960,
        red_chalk: 129920,
        powder_pouch: 208800,
        cold_star_shard: 162400,
        incense_of_oblivion: 501120,
        ghost_delivery_note: 211120
      }
    },
    notes: "special sword price is more complex than a single formula; use validated price table first"
  },
  relic_shop: {
    cases: 3,
    rarity_weights_by_period: {
      day_2_3: [
        85,
        15,
        0
      ],
      day_4_5: [
        75,
        25,
        0
      ],
      day_6: [
        70,
        25,
        5
      ],
      day_7_8: [
        60,
        35,
        5
      ],
      day_9_12: [
        53,
        35,
        12
      ],
      day_13_16: [
        36,
        42,
        22
      ],
      day_17_plus: [
        28,
        42,
        30
      ]
    },
    rarity_order: [
      "common",
      "rare",
      "legendary"
    ],
    price_resource: "sword credits, one credit per offered sword regardless of grade",
    reroll_cost_formula: "max(150, round(0.15*quota))*(2.5**number_of_paid_rerolls_today)",
    owned_relics_not_reoffered: true
  }
};

// src/game/contract/rules.ts
var rules = {
  version: "contract-v3",
  reference: numerical_default,
  credit: numerical_default.tribute.failure_limit,
  recruits: 3,
  equipmentSlots: 8,
  heat: numerical_default.frenzy.charge_needed,
  frenzyShots: 7,
  legacyFrenzyMs: numerical_default.frenzy.base_duration_seconds * 1e3,
  intervalMs: 0,
  contractMonths: 21,
  growth: { gain: 10, loss: 10, epsilon: 0.1, initialMin: 24, initialMax: 48 },
  matching: { enter: 0.65, margin: 0.05, tie: 1e-6, specialistLevel: 10, specialistRating: 50, specialistStat: 80 },
  tiers: [
    { id: "rotation", level: 2, coreRatio: 0.5 },
    { id: "starter", level: 6, coreRatio: 0.62 },
    { id: "star", level: 10, coreRatio: 0.74 },
    { id: "superstar", level: 14, coreRatio: 0.84 },
    { id: "legend", level: 18, coreRatio: 0.92 }
  ],
  trainingLevelCap: 99,
  // 历史存档与月份计算的技术保护，与训练等级上限分开。
  maxLevel: 1e4
};
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("\u6574\u6570\u53C2\u6570\u8D85\u51FA\u8303\u56F4");
  return value;
}

// src/game/contract/money.ts
function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
function fraction(n, d = 1) {
  let a = BigInt(n), b = BigInt(d);
  if (b === 0n) throw new Error("\u9664\u6570\u4E3A0");
  if (b < 0n) {
    a = -a;
    b = -b;
  }
  const g = gcd(a, b);
  return { n: String(a / g), d: String(b / g) };
}
var zero = () => fraction(0);
function ledger(special = false) {
  return { base: fraction(special ? rules.reference.sword_value.merchant_base : rules.reference.sword_value.base), greatBank: zero(), flat: zero(), permanent: fraction(1) };
}

// src/game/contract/templates.ts
var templateRules = nbaTemplates.map((t) => {
  const tier = rules.tiers.find((v) => v.id === t.tier);
  const allRound = ["lebron", "jordan", "bird"].includes(t.id);
  const keys = allRound ? statKeys : [...statKeys].sort((a, b) => t.stats[b] - t.stats[a]).slice(0, 3);
  const result = { ...t, minLevel: tier.level, coreMinimums: Object.fromEntries(keys.map((k) => [k, Math.ceil(t.stats[k] * tier.coreRatio)])), enter: rules.matching.enter, evidence: "basketball_design", reviewed: true, reviewScope: "mechanics", balanceReviewed: false };
  const floor = { rotation: 55, starter: 75, star: 85, superstar: 90, legend: 94 }[t.tier];
  const enter = { rotation: 0.6, starter: 0.68, star: 0.74, superstar: 0.78, legend: 0.82 }[t.tier];
  result.branches = specialistCores[t.id]?.map((keys2) => ({ keys: keys2, enter, coreMinimums: Object.fromEntries(keys2.map((k) => [k, Math.min(t.stats[k], Math.max(floor, Math.ceil(t.stats[k] * tier.coreRatio)))])) }));
  for (const keys2 of matureSpecialistCores[t.id] ?? []) (result.branches ??= []).push({ keys: keys2, enter, coreMinimums: Object.fromEntries(keys2.map((k) => [k, 90])) });
  if (t.id === "steve-francis") {
    result.coreMinimums = { drive: 85, handle: 88, inside: 62 };
    result.branches = [{ keys: ["drive", "handle"], enter: 0.72, coreMinimums: { drive: 85, handle: 88 } }];
  }
  if (t.id === "amare-stoudemire") result.coreMinimums = { mid: 63, drive: 85, inside: 85 };
  if (t.id === "eric-gordon") result.coreMinimums = { three: 85, inside: 85, drive: 65 };
  if (t.id === "derrick-rose") result.branches = [{ keys: ["drive", "handle"], enter: 0.76, coreMinimums: { drive: 95, handle: 92 } }];
  if (t.id === "jokic") result.branches = [{ keys: ["inside", "handle"], enter: 0.78, coreMinimums: { inside: 95, handle: 93 } }];
  if (t.id === "pippen") result.coreMinimums = { defense: 90, handle: 85, drive: 85 };
  if (t.id === "bryant") result.coreMinimums = { mid: 92, drive: 88, handle: 87 };
  if (t.id === "durant") result.coreMinimums = { mid: 92, three: 88, drive: 84 };
  if (t.id === "jordan") {
    result.coreMinimums = { mid: 90, drive: 90, defense: 90 };
    result.ratingFloor = 80;
    result.statFloor = 60;
  }
  if (t.id === "lebron") {
    result.coreMinimums = { drive: 90, inside: 90, handle: 88 };
    result.ratingFloor = 78;
    result.statFloor = 55;
  }
  if (t.id === "bird") {
    result.coreMinimums = { three: 90, mid: 90, handle: 86 };
    result.ratingFloor = 78;
    result.statFloor = 55;
  }
  return result;
});
var tierRank = (tier) => rules.tiers.findIndex((t) => t.id === tier);
function shape(stats3) {
  const mean = statKeys.reduce((s, k) => s + stats3[k], 0) / 6;
  const spread = Math.max(8, Math.sqrt(statKeys.reduce((s, k) => s + (stats3[k] - mean) ** 2, 0) / 6));
  return Object.fromEntries(statKeys.map((k) => [k, (stats3[k] - mean) / spread]));
}
function similarity(a, b) {
  const z = shape(b), error = Math.sqrt(statKeys.reduce((s, k) => s + (a[k] - z[k]) ** 2, 0) / 6);
  return Math.max(0, 1 - error / 2);
}
function aptitude(stats3, target) {
  return statKeys.reduce((sum, k) => sum + (target[k] <= 0 ? 1 : Math.min(1, stats3[k] / target[k])), 0) / statKeys.length;
}
function specialistAptitude(stats3, target, keys) {
  const mean = (list) => list.reduce((s, k) => s + (target[k] <= 0 ? 1 : Math.min(1, stats3[k] / target[k])), 0) / list.length;
  return 0.7 * mean(keys) + 0.3 * mean(statKeys.filter((k) => !keys.includes(k)));
}
function match(input, catalog = templateRules) {
  integer(input.level, 0, rules.maxLevel);
  const peakLevel = Math.max(input.level, input.peakLevel ?? input.level);
  integer(peakLevel, 0, rules.maxLevel);
  if (!Number.isFinite(input.height) || statKeys.some((k) => !Number.isFinite(input.stats[k]) || input.stats[k] < 0 || input.stats[k] > 99)) throw new Error("\u65E0\u6548\u5339\u914D\u8F93\u5165");
  const full = statKeys.every((k) => input.stats[k] === 99);
  const style = full ? input.lastStyle : shape(input.stats);
  const rows2 = catalog.map((t) => {
    const reasons = [];
    if (input.height < t.height[0] || input.height > t.height[1]) reasons.push("height");
    if (peakLevel < t.minLevel) reasons.push("level");
    const baseScore = aptitude(input.stats, t.stats);
    const baseEligible = baseScore >= t.enter && statKeys.every((k) => input.stats[k] >= (t.coreMinimums[k] ?? 0));
    const branch = !baseEligible ? t.branches?.find((b) => specialistAptitude(input.stats, t.stats, b.keys) >= b.enter && statKeys.every((k) => input.stats[k] >= (b.coreMinimums[k] ?? 0))) : void 0;
    const core = branch?.coreMinimums ?? t.coreMinimums;
    const gaps = statKeys.filter((k) => core[k] !== void 0).map((k) => ({ key: k, actual: input.stats[k], required: core[k], gap: Math.max(0, core[k] - input.stats[k]) }));
    if (gaps.some((v) => v.gap > 0)) reasons.push("core");
    const score = branch ? specialistAptitude(input.stats, t.stats, branch.keys) : baseScore, styleScore = similarity(style, t.stats), threshold = branch?.enter ?? t.enter;
    if (score < threshold) reasons.push("aptitude");
    if (t.ratingFloor !== void 0 && statKeys.reduce((s, k) => s + input.stats[k], 0) / 6 < t.ratingFloor) reasons.push("rating-floor");
    if (t.statFloor !== void 0 && statKeys.some((k) => input.stats[k] < t.statFloor)) reasons.push("stat-floor");
    return { id: t.id, name: t.name, tier: t.tier, minLevel: t.minLevel, height: t.height, gaps, score, styleScore, threshold, eligible: reasons.length === 0, reasons };
  });
  if (!rows2.some((r) => r.eligible) && peakLevel >= rules.matching.specialistLevel && statKeys.reduce((sum, k) => sum + input.stats[k], 0) / 6 >= rules.matching.specialistRating && statKeys.filter((k) => input.stats[k] >= rules.matching.specialistStat).length >= 2) {
    for (const row of rows2) if (row.tier === "rotation" && row.reasons.length === 1 && row.reasons[0] === "core") {
      row.eligible = true;
      row.reasons = ["specialist-entry"];
    }
  }
  const candidates = rows2.filter((r) => r.eligible).sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.styleScore - a.styleScore || a.id.localeCompare(b.id, "en"));
  let best = candidates[0];
  if (best) {
    const ties = candidates.filter((r) => r.tier === best.tier && best.styleScore - r.styleScore <= rules.matching.tie);
    best = [...ties].sort((a, b) => hash(`${input.matchSeed}:${a.id}`) - hash(`${input.matchSeed}:${b.id}`) || a.id.localeCompare(b.id, "en"))[0];
    const old = candidates.find((r) => r.id === input.templateId);
    if (old?.tier === best.tier && best.styleScore - old.styleScore <= rules.matching.margin) best = old;
  }
  const earned = rows2.find((r) => r.id === input.templateId && !r.reasons.includes("height"));
  const retained = !!earned && (input.level < peakLevel || !best || tierRank(best.tier) <= tierRank(earned.tier));
  const selected = retained ? earned : best;
  if (retained) earned.reasons.push("earned-appearance");
  for (const row of rows2) if (row.eligible && row.id !== selected?.id) row.reasons.push(tierRank(row.tier) < tierRank(selected.tier) ? "lower-tier" : "stability");
  return { templateId: selected?.id ?? null, tier: selected?.tier ?? null, aptitude: selected?.score ?? 0, similarity: selected?.styleScore ?? 0, rows: rows2, lastStyle: style, retained };
}
function grow(stats3, bias, result, delta, rng, gain = rules.growth.gain, loss = rules.growth.loss) {
  integer(gain, 0, 100);
  integer(loss, 0, 100);
  const up = result === "success" || result === "great";
  const budget = up ? gain * Math.max(0, delta) : result === "minor" ? loss * Math.max(1, -delta) : 0;
  const weights = statKeys.map((k) => up ? rules.growth.epsilon + bias[k] : 1);
  const next = { ...stats3 };
  for (let i = 0; i < budget; i++) {
    const key = statKeys[weighted(rng, weights)];
    next[key] = Math.max(0, Math.min(99, next[key] + (up ? 1 : -1)));
  }
  return next;
}

// src/utils/cloneData.ts
function cloneData(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  const seen = /* @__PURE__ */ new Map();
  const copy2 = (input) => {
    if (input === null || typeof input !== "object") return input;
    if (seen.has(input)) return seen.get(input);
    const result = Array.isArray(input) ? new Array(input.length) : {};
    seen.set(input, result);
    for (const key of Object.keys(input)) Object.defineProperty(result, key, { value: copy2(input[key]), enumerable: true, writable: true, configurable: true });
    return result;
  };
  return copy2(value);
}

// src/game/contract/runtime/equipment.json
var equipment_default = {
  relics: [
    {
      id: "relic_001",
      name: "\u4F24\u75C5\u4FDD\u9669"
    },
    {
      id: "relic_002",
      name: "\u57FA\u7840\u6295\u7BEE\u673A"
    },
    {
      id: "relic_003",
      name: "\u62A4\u819D\u7ED1\u5E26"
    },
    {
      id: "relic_004",
      name: "\u77EB\u6B63\u8BAD\u7EC3\u4EEA"
    },
    {
      id: "relic_005",
      name: "\u91CC\u7A0B\u5956\u7891"
    },
    {
      id: "relic_006",
      name: "\u8BAD\u7EC3\u8425\u8865\u8D34"
    },
    {
      id: "relic_007",
      name: "\u65B0\u4EBA\u9996\u8BAD\u8BFE"
    },
    {
      id: "relic_008",
      name: "\u5FC3\u7406\u8F85\u5BFC\u624B\u518C"
    },
    {
      id: "relic_009",
      name: "\u7403\u63A2\u8BA4\u8BC1\u7AE0"
    },
    {
      id: "relic_010",
      name: "\u660E\u661F\u8BAD\u7EC3\u5E08\u5FBD\u7AE0"
    },
    {
      id: "relic_011",
      name: "\u8282\u594F\u8BAD\u7EC3\u5E26"
    },
    {
      id: "relic_012",
      name: "\u5E78\u8FD0\u62A4\u8155"
    },
    {
      id: "relic_013",
      name: "\u5EB7\u590D\u8865\u507F\u534F\u8BAE"
    },
    {
      id: "relic_014",
      name: "\u51A5\u60F3\u8BAD\u7EC3\u57AB"
    },
    {
      id: "relic_015",
      name: "\u9547\u9759\u547C\u5438\u5668"
    },
    {
      id: "relic_016",
      name: "\u8865\u62DB\u540D\u989D"
    },
    {
      id: "relic_017",
      name: "\u8BAD\u7EC3\u8BA1\u65F6\u5668"
    },
    {
      id: "relic_018",
      name: "\u8282\u594F\u5339\u914D\u5668"
    },
    {
      id: "relic_019",
      name: "\u52A8\u4F5C\u6821\u6B63\u677F"
    },
    {
      id: "relic_020",
      name: "\u91CD\u4F24\u7406\u8D54\u534F\u8BAE"
    },
    {
      id: "relic_021",
      name: "\u9006\u5883\u6295\u7BEE\u9AB0"
    },
    {
      id: "relic_022",
      name: "\u4E13\u6CE8\u8282\u62CD\u5668"
    },
    {
      id: "relic_023",
      name: "\u6BD4\u8D5B\u9605\u8BFB\u773C\u955C"
    },
    {
      id: "relic_024",
      name: "\u51B7\u9759\u5242"
    },
    {
      id: "relic_026",
      name: "\u4F24\u540E\u8C03\u6574\u8155\u8868"
    },
    {
      id: "relic_027",
      name: "\u8FDE\u80DC\u5E86\u529F\u7EF3"
    },
    {
      id: "relic_028",
      name: "\u4F20\u627F\u7B14\u8BB0"
    },
    {
      id: "relic_029",
      name: "\u4F24\u75C5\u4EF7\u503C\u8BC4\u4F30\u8868"
    },
    {
      id: "relic_030",
      name: "\u4E13\u4E1A\u62A4\u8E1D"
    },
    {
      id: "relic_032",
      name: "\u6295\u7BEE\u8282\u594F\u5E26"
    },
    {
      id: "relic_033",
      name: "\u8D1F\u91CD\u80CC\u5FC3"
    },
    {
      id: "relic_034",
      name: "\u4F20\u5947\u4F24\u75C5\u6863\u6848"
    },
    {
      id: "relic_035",
      name: "\u635F\u5931\u8865\u507F\u57FA\u91D1"
    },
    {
      id: "relic_036",
      name: "\u9002\u5E94\u6027\u5EB7\u590D\u7EF7\u5E26"
    },
    {
      id: "relic_037",
      name: "\u9EC4\u91D1\u6295\u7BEE\u624B\u5957"
    },
    {
      id: "relic_038",
      name: "\u4E0D\u5C48\u6597\u5FD7"
    },
    {
      id: "relic_039",
      name: "\u4FE1\u7528\u9006\u88AD\u5FBD\u7AE0"
    },
    {
      id: "relic_040",
      name: "\u9010\u6B65\u70ED\u8EAB\u8BA1\u5212"
    },
    {
      id: "relic_041",
      name: "\u84C4\u529B\u6295\u7BEE\u6307\u5BFC"
    },
    {
      id: "relic_042",
      name: "\u8FDE\u7EED\u5F97\u5206\u6307\u5BFC"
    },
    {
      id: "relic_043",
      name: "\u8BAD\u7EC3\u5668\u6750\u4F18\u60E0\u5238"
    },
    {
      id: "relic_044",
      name: "\u505C\u7528\u624B\u611F\u4F20\u627F\u7AE0"
    },
    {
      id: "relic_045",
      name: "\u5668\u6750\u56DE\u6536\u51ED\u8BC1"
    },
    {
      id: "relic_046",
      name: "\u7EDD\u4F73\u8868\u73B0\u5956\u91D1"
    },
    {
      id: "relic_047",
      name: "\u9006\u5883\u7A81\u7834\u6307\u5357"
    },
    {
      id: "relic_048",
      name: "\u5F00\u573A\u70ED\u8EAB\u9879\u94FE"
    },
    {
      id: "relic_049",
      name: "\u53CD\u5F39\u8BAD\u7EC3\u5668"
    },
    {
      id: "relic_050",
      name: "\u62DB\u751F\u53E3\u7891\u8BA4\u8BC1"
    },
    {
      id: "relic_051",
      name: "\u9EC4\u91D1\u624B\u611F\u5370\u8BB0"
    },
    {
      id: "relic_052",
      name: "\u5B8C\u7F8E\u51FA\u624B\u6821\u51C6\u5668"
    },
    {
      id: "relic_053",
      name: "\u88AB\u52A8\u6210\u957F\u8BFE\u7A0B"
    },
    {
      id: "relic_054",
      name: "\u591A\u6837\u5316\u8BAD\u7EC3\u8BA1\u5212"
    },
    {
      id: "relic_055",
      name: "\u4F24\u540E\u4E0D\u9000\u8BAD\u7EC3\u6CD5"
    },
    {
      id: "relic_056",
      name: "\u6708\u5EA6\u4F24\u75C5\u8C41\u514D\u5361"
    },
    {
      id: "relic_057",
      name: "\u4E13\u4E1A\u9632\u6ED1\u624B\u5957"
    },
    {
      id: "relic_058",
      name: "\u9AD8\u9636\u7403\u63A2\u62A5\u544A"
    },
    {
      id: "relic_059",
      name: "\u6295\u7BEE\u52A8\u4F5C\u8BB0\u5FC6\u5668"
    },
    {
      id: "relic_060",
      name: "\u9AD8\u7EA7\u62A4\u5177\u7EC4\u5408"
    },
    {
      id: "relic_061",
      name: "\u56DE\u54CD\u6295\u7BEE\u673A"
    },
    {
      id: "relic_062",
      name: "\u6297\u4F24\u62A4\u8170"
    },
    {
      id: "relic_063",
      name: "\u5DC5\u5CF0\u65F6\u523B\u8BA1\u65F6\u5668"
    },
    {
      id: "relic_064",
      name: "\u6295\u7BEE\u8868\u73B0\u5956\u52B1\u5668"
    },
    {
      id: "relic_065",
      name: "\u4F24\u75C5\u7ECF\u9A8C\u6863\u6848"
    },
    {
      id: "relic_066",
      name: "\u8FD8\u6B3E\u4F18\u60E0\u534F\u8BAE"
    },
    {
      id: "relic_067",
      name: "\u738B\u724C\u62DB\u751F\u63A8\u8350\u4FE1"
    },
    {
      id: "relic_068",
      name: "\u51C6\u65F6\u8FD8\u6B3E\u79EF\u5206\u5361"
    },
    {
      id: "relic_069",
      name: "\u8FDE\u6295\u4F30\u503C\u653E\u5927\u5668"
    },
    {
      id: "relic_070",
      name: "\u7EC8\u573A\u52A0\u7EC3\u94C3"
    },
    {
      id: "relic_071",
      name: "\u9AD8\u9636\u6295\u7BEE\u89C6\u955C"
    },
    {
      id: "relic_072",
      name: "\u706B\u70ED\u5EF6\u65F6\u8868"
    },
    {
      id: "relic_073",
      name: "\u5927\u5E08\u6295\u7BEE\u8BBE\u5907"
    },
    {
      id: "relic_074",
      name: "\u62DB\u751F\u6269\u5C55\u8BB8\u53EF"
    },
    {
      id: "relic_075",
      name: "\u6781\u9650\u5192\u9669\u62A4\u8155"
    },
    {
      id: "relic_076",
      name: "\u51A0\u519B\u8BAD\u7EC3\u4F20\u627F\u4E66"
    },
    {
      id: "relic_077",
      name: "\u4FE1\u7528\u7D27\u6025\u4FDD\u969C"
    },
    {
      id: "relic_078",
      name: "\u8010\u5FC3\u79EF\u84C4\u5668"
    },
    {
      id: "relic_079",
      name: "\u9876\u7EA7\u8FD0\u52A8\u533B\u7597\u9669"
    },
    {
      id: "relic_080",
      name: "\u4E94\u7EF4\u5747\u8861\u8BAD\u7EC3\u6CD5"
    },
    {
      id: "relic_081",
      name: "\u8BAD\u7EC3\u7ED3\u679C\u590D\u523B\u955C"
    },
    {
      id: "relic_082",
      name: "\u91C7\u8D2D\u7F51\u7EDC\u6269\u5C55\u5408\u540C"
    },
    {
      id: "relic_083",
      name: "\u8BAD\u7EC3\u8425\u58F0\u671B\u57FA\u91D1"
    },
    {
      id: "relic_084",
      name: "\u4F24\u75C5\u7F13\u51B2\u6838\u5FC3"
    },
    {
      id: "relic_085",
      name: "\u6301\u7EED\u8FDB\u6B65\u8BAD\u7EC3\u5668"
    },
    {
      id: "relic_086",
      name: "\u4F4E\u5F3A\u5EA6\u7406\u8D22\u8BA1\u5212"
    },
    {
      id: "relic_087",
      name: "\u5DC5\u5CF0\u6295\u7BEE\u6838\u5FC3"
    },
    {
      id: "relic_088",
      name: "\u8D85\u9891\u8BAD\u7EC3\u673A"
    },
    {
      id: "relic_089",
      name: "\u8D85\u989D\u8FD8\u6B3E\u8FD4\u5229"
    },
    {
      id: "relic_090",
      name: "\u7EC8\u6781\u9632\u62A4\u88C5\u5907"
    },
    {
      id: "relic_091",
      name: "\u957F\u671F\u62DB\u751F\u8BB8\u53EF\u8BC1"
    },
    {
      id: "relic_092",
      name: "\u9AD8\u9636\u660E\u661F\u4EE3\u8A00"
    },
    {
      id: "relic_093",
      name: "\u53CC\u751F\u7403\u5458\u8BA1\u5212"
    },
    {
      id: "relic_094",
      name: "\u4F24\u75C5\u8865\u62DB\u5408\u540C"
    },
    {
      id: "relic_095",
      name: "\u6301\u4E45\u706B\u70ED\u8BAD\u7EC3\u5E26"
    },
    {
      id: "relic_096",
      name: "\u8D85\u7EA7\u5DE8\u661F\u7ECF\u7EAA\u5408\u540C"
    },
    {
      id: "relic_097",
      name: "\u4F20\u5947\u6295\u7BEE\u9AB0"
    },
    {
      id: "relic_098",
      name: "\u91D1\u724C\u8BAD\u7EC3\u5E08\u7EC8\u8EAB\u534F\u8BAE"
    }
  ]
};

// src/game/contract/commerce.ts
var id = (n) => `relic_${String(n).padStart(3, "0")}`;
var common = [[1, 2, 1], [2, 2, 1], [3, 2, 1], [4, 2, 1], [6, 2, 1], [8, 2, 1], [9, 2, 1], [10, 2, 1], [11, 2, 1], [12, 2, 1], [13, 2, 1], [14, 2, 1], [17, 2, 1], [19, 2, 1], [24, 3, 1], [26, 3, 1], [30, 3, 1]];
var rare = [[20, 2, 1], [36, 3, 2], [37, 3, 2], [41, 3, 2], [43, 3, 2], [46, 4, 1], [48, 4, 2], [56, 4, 2], [57, 4, 2], [58, 5, 2], [60, 5, 2], [63, 5, 2], [64, 5, 2], [66, 5, 2], [68, 5, 3], [69, 6, 2], [72, 6, 2], [73, 6, 2], [74, 6, 2], [83, 7, 3], [91, 8, 4]];
var legendary = [[75, 6, 3], [77, 6, 4], [79, 6, 3], [80, 6, 4], [82, 6, 3], [86, 7, 4], [87, 7, 4], [88, 7, 3], [89, 7, 4], [90, 7, 4], [92, 8, 4], [93, 8, 4], [95, 8, 4], [96, 9, 3], [97, 9, 3], [98, 10, 5]];
common.push(...[5, 7, 15, 18].map((n) => [n, 2, 1]), ...[21, 22, 23, 27, 28, 29, 32, 33].map((n) => [n, 3, 1]));
rare.push(...[[34, 3, 1], [35, 3, 1], [38, 3, 2], [39, 3, 1], [40, 3, 1], [42, 3, 2], [45, 4, 2], [47, 4, 3], [49, 4, 2], [50, 4, 2], [51, 4, 1], [52, 4, 2], [53, 4, 3], [54, 4, 2], [55, 4, 2], [59, 5, 3], [61, 5, 2], [62, 5, 2], [65, 5, 3], [67, 5, 2], [70, 6, 2], [71, 6, 2]]);
legendary.push(...[[76, 6, 3], [78, 6, 3], [81, 6, 3], [84, 7, 4], [85, 7, 4], [94, 8, 4]]);
var starter = [2, 3, 9, 17, 36, 41, 11, 12];
var locked = [75, 76, 77, 80, 82, 84, 85, 86, 87, 89, 90, 92, 93, 94, 95, 98];
var shopCatalog = [["common", common], ["rare", rare], ["legendary", legendary]].flatMap(([rarity, rows2]) => rows2.map(([n, month, price]) => ({
  id: id(n),
  name: equipment_default.relics.find((r) => r.id === id(n)).name,
  rarity,
  month,
  price,
  locked: locked.includes(n),
  starter: starter.includes(n),
  defensive: [3, 20, 30, 34, 36, 56].includes(n),
  earlyValue: [6, 7, 8, 9, 10, 13, 18].includes(n)
})));

// src/game/gym/equipmentArt.ts
var equipmentArtIds = {
  relic_014: "relic_003",
  relic_034: "relic_033",
  relic_090: "relic_090",
  relic_002: "relic_014",
  relic_042: "relic_015",
  relic_078: "relic_078",
  relic_017: "relic_007",
  relic_037: "relic_040",
  relic_085: "relic_085",
  relic_006: "relic_028",
  relic_046: "relic_059",
  relic_081: "relic_076",
  relic_007: "relic_002",
  relic_051: "relic_061",
  relic_087: "relic_088",
  relic_028: "relic_017",
  relic_065: "relic_063",
  relic_077: "relic_072",
  relic_001: "relic_005",
  relic_045: "relic_010",
  relic_082: "relic_092",
  relic_003: "relic_046",
  relic_079: "relic_096",
  relic_024: "relic_032",
  relic_096: "relic_037",
  relic_004: "relic_004",
  relic_076: "relic_052",
  relic_008: "relic_019",
  relic_080: "relic_047",
  relic_012: "relic_030",
  relic_084: "relic_049",
  relic_040: "relic_011",
  relic_088: "relic_057",
  relic_020: "relic_023",
  relic_092: "relic_060"
};

// src/game/gym/equipmentLegacy.ts
var recoveryIds = /* @__PURE__ */ new Set([2, 4, 7, 11, 12, 17, 18, 19, 21, 22, 23, 26, 27, 32, 37, 40, 41, 42, 48, 49, 51, 52, 53, 55, 57, 59, 61, 62, 63, 70, 71, 72, 73, 78, 84, 85, 87, 88, 93, 95, 97]);
var valueIds = /* @__PURE__ */ new Set([1, 5, 6, 8, 9, 10, 13, 20, 24, 29, 33, 35, 43, 45, 46, 50, 54, 58, 64, 66, 67, 68, 69, 74, 79, 81, 82, 83, 86, 89, 91, 92, 94, 96, 98]);
var tierBudget = {
  common: { stamina: 2, recovery: 1, valuePercent: 10 },
  rare: { stamina: 4, recovery: 2, valuePercent: 20 },
  legendary: { stamina: 7, recovery: 3, valuePercent: 35 }
};
function legacyEquipmentPrice(rarity, effects) {
  const tierCost = { common: 0, rare: 16, legendary: 40 }[rarity];
  const strength = effects.stamina * 2 + effects.recovery * 4 + effects.valuePercent * 2 / 5 + Math.round(effects.focusPower * 10) + effects.courseRecovery * 16 + effects.cooperationBonus * 16;
  return Math.max(2, Math.ceil((tierCost + strength) / 4));
}
var legacyEquipmentCatalog = shopCatalog.map((item) => {
  const number = Number(item.id.slice(6));
  const budget = tierBudget[item.rarity];
  const effects = { stamina: 0, recovery: 0, valuePercent: 0, focusKey: null, focusPower: 0, courseRecovery: 0, cooperationBonus: 0 };
  if (recoveryIds.has(number)) effects.recovery = budget.recovery;
  else if (valueIds.has(number)) effects.valuePercent = budget.valuePercent;
  else effects.stamina = budget.stamina;
  if (number % 4 === 0) {
    effects.focusKey = statKeys[Math.floor(number / 4) % statKeys.length];
    effects.focusPower = item.rarity === "common" ? 0.4 : item.rarity === "rare" ? 0.7 : 1;
  } else if (number % 4 === 1) effects.courseRecovery = item.rarity === "common" ? 1 : item.rarity === "rare" ? 2 : 3;
  else if (number % 4 === 2) effects.valuePercent = Math.max(effects.valuePercent, budget.valuePercent);
  else effects.cooperationBonus = item.rarity === "legendary" ? 2 : 1;
  const unlockLevel = Math.min(8, Math.max(item.rarity === "legendary" ? 5 : item.rarity === "rare" ? 3 : 1, item.month - 1));
  const price = legacyEquipmentPrice(item.rarity, effects);
  const descriptions = [];
  if (effects.stamina) descriptions.push(`\u4F53\u529B\u4E0A\u9650 +${effects.stamina}\uFF08\u5668\u6750\u5408\u8BA1\u6700\u591A +20\uFF09`);
  if (effects.recovery) descriptions.push(`\u4F53\u529B\u6062\u590D\u95F4\u9694\u7F29\u77ED ${effects.recovery} \u79D2\uFF08\u5668\u6750\u5408\u8BA1\u6700\u591A\u7F29\u77ED 4 \u79D2\uFF09`);
  if (effects.valuePercent) descriptions.push(`\u5C55\u793A\u8EAB\u4EF7 +${effects.valuePercent}%\uFF0C\u540C\u65F6\u589E\u52A0\u54C1\u724C\u58F0\u671B\u500D\u7387\uFF08\u5668\u6750\u500D\u7387\u5408\u8BA1\u6700\u591A +50%\uFF09`);
  if (effects.focusKey) descriptions.push(`${{ three: "\u4E09\u5206", mid: "\u4E2D\u6295", drive: "\u7A81\u7834", inside: "\u7BEE\u4E0B", handle: "\u63A7\u7403", defense: "\u9632\u5B88" }[effects.focusKey]}\u6210\u957F\u62BD\u53D6\u6743\u91CD +${effects.focusPower}\uFF08\u5355\u7EF4\u5668\u6750\u52A0\u503C\u6700\u591A +1.5\uFF09`);
  if (effects.courseRecovery) descriptions.push(`\u6BCF\u5B8C\u6210\u4E00\u8BFE\u989D\u5916\u6062\u590D ${effects.courseRecovery} \u4F53\u529B\uFF08\u53D7\u9986\u7EA7\u989D\u5916\u6062\u590D\u4E0A\u9650\u9650\u5236\uFF09`);
  if (effects.cooperationBonus) descriptions.push(`\u5B8C\u6210\u5408\u4F5C\u4E14\u63A5\u53D6\u540E\u5B8C\u6210\u81F3\u5C11 2 \u8282\u8BFE\u7A0B\uFF0C\u989D\u5916\u83B7\u5F97 ${effects.cooperationBonus} \u5238\uFF08\u5668\u6750\u5408\u8BA1\u6700\u591A +2\uFF09`);
  const description = descriptions.join("\uFF1B") + "\u3002";
  return {
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    unlockLevel,
    price,
    effects,
    description,
    requiredTemplates: item.locked ? Math.min(35, unlockLevel * 4) : 0
  };
});
var effectGroups = /* @__PURE__ */ new Map();
for (const item of legacyEquipmentCatalog) {
  const signature = JSON.stringify(item.effects);
  const group2 = effectGroups.get(signature) ?? [];
  group2.push(item);
  effectGroups.set(signature, group2);
}
var canonicalIds = /* @__PURE__ */ new Map();
for (const group2 of effectGroups.values()) {
  const representative = [...group2].sort((a, b) => a.unlockLevel - b.unlockLevel || a.requiredTemplates - b.requiredTemplates || a.id.localeCompare(b.id))[0];
  for (const item of group2) canonicalIds.set(item.id, representative.id);
}
var equipmentCanonicalIds = canonicalIds;
var previousEquipmentCatalog = legacyEquipmentCatalog.filter((item) => canonicalIds.get(item.id) === item.id);
var removedEquipmentCatalog = legacyEquipmentCatalog.filter((item) => canonicalIds.get(item.id) !== item.id);

// src/game/gym/catalog.ts
var selectedRecruitmentPrice = 8;
var selectedRecruitmentUnlockLevel = 6;
var projects = [
  { id: "endurance", name: "\u8010\u529B\u8BAD\u7EC3", unlockLevel: 1, maxLevel: 8, basePrice: 1, prices: [1, 2, 3, 5, 7, 10, 14, 20], description: "\u6BCF\u7EA7\u589E\u52A0 5 \u70B9\u4F53\u529B\u4E0A\u9650\uFF0C\u4E0D\u8865\u5145\u5F53\u524D\u4F53\u529B\u3002", available: true },
  { id: "recovery", name: "\u6062\u590D\u62A4\u7406", unlockLevel: 1, maxLevel: 8, basePrice: 1, description: "\u6BCF\u7EA7\u5C06\u6062\u590D 1 \u70B9\u4F53\u529B\u6240\u9700\u65F6\u95F4\u7F29\u77ED 1 \u79D2\u3002", available: true },
  { id: "recruitment", name: "\u62DB\u751F\u57F9\u517B", unlockLevel: 2, maxLevel: 6, basePrice: 2, prices: [2, 4, 7, 10, 14, 20], description: "\u6BCF\u7EA7\u4F7F\u4E0B\u4E00\u540D\u65B0\u4EBA\u51FA\u751F\u516D\u7EF4\u5404\u589E\u52A0 1 \u70B9\u3002", available: true },
  { id: "equipment", name: "\u5668\u68B0\u7BA1\u7406", unlockLevel: 2, maxLevel: 4, basePrice: 2, description: "\u6BCF\u7EA7\u589E\u52A0 1 \u4E2A\u5668\u6750\u542F\u7528\u69FD\u3002", available: true },
  { id: "automation", name: "\u81EA\u52A8\u8BAD\u7EC3", unlockLevel: 2, maxLevel: 5, basePrice: 3, description: "\u7403\u9986 2 \u7EA7\u514D\u8D39\u89E3\u9501\u5728\u7EBF\u4E0E\u79BB\u7EBF\u81EA\u52A8\u8BAD\u7EC3\u3002\u9879\u76EE\u6BCF\u7EA7\u4F7F\u6BCF\u7403\u7ECF\u9A8C\u989D\u5916 +1\uFF0C\u5E76\u7F29\u77ED\u51FA\u624B\u95F4\u9694 0.2 \u79D2\uFF0C\u6700\u4F4E 1 \u79D2\uFF1B\u4F53\u529B\u4E0D\u8DB3\u4ECD\u9700\u6062\u590D\u3002", available: true },
  { id: "offline", name: "\u79BB\u7EBF\u8BFE\u8868", unlockLevel: 2, maxLevel: 5, basePrice: 2, description: "\u7403\u9986 2 \u7EA7\u514D\u8D39\u83B7\u5F97 30 \u5206\u949F\u79BB\u7EBF\u8BAD\u7EC3\uFF1B\u9879\u76EE\u4F9D\u6B21\u63D0\u5347\u81F3 45\u300160\u300190\u3001120\u3001180 \u5206\u949F\u3002\u8D85\u65F6\u53EA\u6062\u590D\u4F53\u529B\uFF0C\u4EC5\u8BAD\u7EC3\u5F00\u542F\u81EA\u52A8\u7684\u7403\u5458\u3002", available: true }
];
var trainingCreditMilestones = [
  { level: 10, tier: 2, credits: 3 },
  { level: 15, tier: 3, credits: 7 },
  { level: 20, tier: 4, credits: 12 },
  { level: 25, tier: 5, credits: 18 }
];
var maximumRecommendationCredits = 33;
var postgameRepeatTemplateCredits = 1;
var gymLevels = [
  { level: 1, name: "\u793E\u533A\u8BAD\u7EC3\u9986", fame: 0, upgradePrice: 0, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 0, requiredTemplates: 0 },
  { level: 2, name: "\u8857\u533A\u8BAD\u7EC3\u9986", fame: 60, upgradePrice: 0, requiredRecommendations: 2, requiredTier: 0, requiredLegends: 0, requiredTemplates: 0 },
  { level: 3, name: "\u57CE\u533A\u8BAD\u7EC3\u9986", fame: 500, upgradePrice: 10, requiredRecommendations: 0, requiredTier: 3, requiredLegends: 0, requiredTemplates: 0 },
  { level: 4, name: "\u533A\u57DF\u8BAD\u7EC3\u4E2D\u5FC3", fame: 1300, upgradePrice: 20, requiredRecommendations: 0, requiredTier: 4, requiredLegends: 0, requiredTemplates: 0 },
  { level: 5, name: "\u57CE\u5E02\u8BAD\u7EC3\u4E2D\u5FC3", fame: 3e3, upgradePrice: 40, requiredRecommendations: 0, requiredTier: 5, requiredLegends: 0, requiredTemplates: 0 },
  { level: 6, name: "\u7701\u7EA7\u8BAD\u7EC3\u57FA\u5730", fame: 6e3, upgradePrice: 80, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 3, requiredTemplates: 8 },
  { level: 7, name: "\u5168\u56FD\u8BAD\u7EC3\u57FA\u5730", fame: 11e3, upgradePrice: 140, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 8, requiredTemplates: 15 },
  { level: 8, name: "\u4F20\u5947\u7BEE\u7403\u5B66\u9662", fame: 18e3, upgradePrice: 220, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 15, requiredTemplates: 25 }
];
var equipmentCatalogVersion = 3;
var statLabels2 = { three: "\u4E09\u5206", mid: "\u4E2D\u6295", drive: "\u7A81\u7834", inside: "\u7BEE\u4E0B", handle: "\u63A7\u7403", defense: "\u9632\u5B88" };
var emptyEffects = {
  stamina: 0,
  recovery: 0,
  valuePercent: 0,
  focusKey: null,
  focusPower: 0,
  courseRecovery: 0,
  cooperationBonus: 0,
  experience: 0,
  automationExperience: 0,
  offlineMinutes: 0
};
var originalEquipmentById = new Map(shopCatalog.map((item) => [item.id, item]));
function equipment(id2, family, grade, unlockLevel, price, effects, requiredTemplates = 0) {
  const logicalId = `relic_${String(id2).padStart(3, "0")}`;
  const artId = equipmentArtIds[logicalId];
  const original = originalEquipmentById.get(artId);
  if (!original) throw new Error(`Missing original equipment artwork/name pair: ${logicalId}`);
  const e = { ...emptyEffects, ...effects };
  const text2 = [];
  if (e.stamina) text2.push(`\u5168\u4F53\u7403\u5458\u4F53\u529B\u4E0A\u9650 +${e.stamina}`);
  if (e.recovery) text2.push(`\u4F53\u529B\u6062\u590D\u65F6\u95F4\u7F29\u77ED ${e.recovery} \u79D2`);
  if (e.courseRecovery) text2.push(`\u5B8C\u6210\u8BFE\u7A0B\u989D\u5916\u6062\u590D ${e.courseRecovery} \u70B9\u4F53\u529B\uFF08\u53D7\u9986\u7EA7\u4E0A\u9650\u9650\u5236\uFF09`);
  if (e.experience) text2.push(`\u624B\u52A8\u3001\u81EA\u52A8\u6295\u7BEE\u989D\u5916 +${e.experience} \u7ECF\u9A8C`);
  if (e.automationExperience) text2.push(`\u81EA\u52A8\u6295\u7BEE\u989D\u5916 +${e.automationExperience} \u7ECF\u9A8C`);
  if (e.offlineMinutes) text2.push(`\u79BB\u7EBF\u7ED3\u7B97\u8BAD\u7EC3\u65F6\u957F +${e.offlineMinutes} \u5206\u949F\uFF08\u4E0A\u96504\u5C0F\u65F6\uFF09`);
  if (e.valuePercent) text2.push(`\u57F9\u517B\u54C1\u724C\u58F0\u671B +${e.valuePercent}%\uFF1B\u5C55\u793A\u8EAB\u4EF7 +${e.valuePercent}%`);
  if (e.cooperationBonus) text2.push(`\u5B8C\u6210\u81F3\u5C11 2 \u4E2A\u5B8C\u6574\u8BFE\u7A0B\uFF0C\u8FBE\u6807\u63A8\u8350\u7406\u8BBA\u989D\u5916 +${e.cooperationBonus} \u5238`);
  if (e.focusKey) text2.push(`${statLabels2[e.focusKey]}\u6210\u957F\u503E\u5411 +${e.focusPower}\uFF0C\u5347\u7EA7\u65F6\u66F4\u5BB9\u6613\u63D0\u5347\u6B64\u5C5E\u6027`);
  return {
    id: logicalId,
    artId,
    name: original.name,
    family,
    grade,
    rarity: grade === 1 ? "common" : grade === 2 ? "rare" : "legendary",
    unlockLevel,
    price,
    effects: e,
    description: text2.join("\uFF1B") + "\u3002\u540C\u7C7B\u4EC5\u542F\u7528\u4E00\u4EF6\u3002",
    requiredTemplates
  };
}
var equipmentCatalog = [
  equipment(14, "capacity", 1, 1, 2, { stamina: 4 }),
  equipment(34, "capacity", 2, 3, 6, { stamina: 10 }),
  equipment(90, "capacity", 3, 6, 12, { stamina: 20 }, 8),
  equipment(2, "recovery", 1, 1, 3, { recovery: 1 }),
  equipment(42, "recovery", 2, 3, 8, { recovery: 2 }),
  equipment(78, "recovery", 3, 7, 30, { recovery: 4 }, 8),
  equipment(17, "course", 1, 1, 5, { courseRecovery: 1 }),
  equipment(37, "course", 2, 3, 12, { courseRecovery: 2 }),
  equipment(85, "course", 3, 8, 36, { courseRecovery: 3 }, 8),
  equipment(6, "experience", 1, 1, 4, { experience: 1 }),
  equipment(46, "experience", 2, 3, 10, { experience: 2 }),
  equipment(81, "experience", 3, 7, 20, { experience: 3 }, 8),
  equipment(7, "automation", 1, 2, 3, { automationExperience: 1 }),
  equipment(51, "automation", 2, 4, 8, { automationExperience: 2 }),
  equipment(87, "automation", 3, 6, 16, { automationExperience: 3 }, 8),
  equipment(28, "offline", 1, 2, 2, { offlineMinutes: 15 }),
  equipment(65, "offline", 2, 4, 6, { offlineMinutes: 30 }),
  equipment(77, "offline", 3, 6, 14, { offlineMinutes: 60 }, 8),
  equipment(1, "brand", 1, 1, 2, { valuePercent: 10 }),
  equipment(45, "brand", 2, 3, 6, { valuePercent: 25 }),
  equipment(82, "brand", 3, 6, 14, { valuePercent: 50 }, 8),
  equipment(3, "cooperation", 1, 2, 5, { cooperationBonus: 1 }),
  equipment(79, "cooperation", 3, 5, 14, { cooperationBonus: 2 }, 8),
  ...[
    ["three", 24, 96],
    ["mid", 4, 76],
    ["drive", 8, 80],
    ["inside", 12, 84],
    ["handle", 40, 88],
    ["defense", 20, 92]
  ].flatMap(([key, basic, advanced]) => [
    equipment(basic, `focus-${key}`, 1, 2, 3, { focusKey: key, focusPower: 0.4 }),
    equipment(advanced, `focus-${key}`, 3, 5, 12, { focusKey: key, focusPower: 1.2 }, 8)
  ])
];

// src/game/gym/selectedRecruitment.ts
var selectedRecruitmentDirections = [
  { id: "shooting", label: "\u6295\u5C04", keys: ["three", "mid"], planId: "shooting" },
  { id: "finishing", label: "\u6301\u7403", keys: ["drive", "handle"], planId: "finishing" },
  { id: "interior", label: "\u5185\u7EBF", keys: ["inside", "defense"], planId: "interior" }
];
function isSelectedRecruitmentDirection(value) {
  return selectedRecruitmentDirections.some((direction) => direction.id === value);
}
function selectedRecruitmentBase(stats3, direction, source) {
  const result = { ...stats3 };
  const option = selectedRecruitmentDirections.find((option2) => option2.id === direction);
  if (!option) throw new Error("\u7CBE\u9009\u65B9\u5411\u65E0\u6548");
  for (const key of option.keys) if (result[key] < 46) result[key] = 46 + Math.floor(random(source) * 3);
  return result;
}

// src/game/gym/training.ts
var trainingPlans = [
  { id: "balanced", name: "\u57FA\u7840\u8BAD\u7EC3", focusKeys: [], description: "\u6CBF\u7528\u7403\u5458\u539F\u56FA\u6709\u6210\u957F\u504F\u597D\u3002" },
  { id: "shooting", name: "\u6295\u5C04\u4E13\u9879", focusKeys: ["three", "mid"], description: "\u5347\u7EA7\u65F6\u66F4\u5BB9\u6613\u63D0\u5347\u4E09\u5206\u4E0E\u4E2D\u6295\u3002" },
  { id: "finishing", name: "\u6301\u7403\u7A81\u7834", focusKeys: ["drive", "handle"], description: "\u5347\u7EA7\u65F6\u66F4\u5BB9\u6613\u63D0\u5347\u7A81\u7834\u4E0E\u63A7\u7403\u3002" },
  { id: "interior", name: "\u5185\u7EBF\u9632\u5B88", focusKeys: ["inside", "defense"], description: "\u5347\u7EA7\u65F6\u66F4\u5BB9\u6613\u63D0\u5347\u7BEE\u4E0B\u4E0E\u9632\u5B88\u3002" }
];
function trainingBias(bias, planId, focus) {
  const plan = trainingPlans.find((entry) => entry.id === planId);
  const next = { ...bias };
  for (const key of Object.keys(bias)) {
    const original = 0.1 + bias[key];
    const equipment2 = Math.min(1.5, focus[key]);
    next[key] = plan.focusKeys.includes(key) ? original * 2 + 0.5 + equipment2 - 0.1 : bias[key] + equipment2;
  }
  return next;
}

// src/game/gym/cooperation.ts
function buildCooperationOffers(state, player2 = state.player) {
  if (!player2) return [];
  const prefixes = `${player2.id}:`;
  const pairs = [["three", "mid"], ["drive", "handle"], ["inside", "defense"]];
  const pair = pairs[hash(`${state.seed}:${player2.id}:cooperation`) % pairs.length];
  const basic = {
    id: prefixes + "basic",
    kind: "basic",
    name: "\u57FA\u7840\u57F9\u517B\u5408\u4F5C",
    description: "\u63A5\u53D6\u540E\u5B8C\u6210 10 \u6B21\u8BAD\u7EC3\u30011 \u8282\u8BFE\u7A0B\uFF0C\u5E76\u57F9\u517B\u5230\u66FF\u8865\u53CA\u4EE5\u4E0A\u3002",
    requiredShots: 10,
    requiredCourses: 1,
    requiredTier: 1,
    focusKeys: [],
    requiredAttribute: 0,
    credits: 1,
    fame: 10
  };
  const specialist = {
    id: prefixes + "specialist",
    kind: "specialist",
    name: "\u4E13\u9879\u57F9\u517B\u5408\u4F5C",
    description: "\u63A5\u53D6\u540E\u5B8C\u6210 20 \u6B21\u8BAD\u7EC3\u30012 \u8282\u8BFE\u7A0B\uFF0C\u8FBE\u5230\u9996\u53D1\u53CA\u4EE5\u4E0A\uFF0C\u5E76\u6EE1\u8DB3\u4E24\u9879\u4E13\u9879\u80FD\u529B\u3002",
    requiredShots: 20,
    requiredCourses: 2,
    requiredTier: 2,
    focusKeys: pair,
    requiredAttribute: 65,
    credits: 3,
    fame: 55
  };
  const level = player2.enteredGymLevel;
  const third = level <= 2 ? { id: prefixes + "rising", kind: "rising", name: "\u65B0\u661F\u57F9\u517B\u5408\u4F5C", description: "\u63A5\u53D6\u540E\u5B8C\u6210 30 \u6B21\u8BAD\u7EC3\u30013 \u8282\u8BFE\u7A0B\uFF0C\u5E76\u57F9\u517B\u5230\u5168\u660E\u661F\u53CA\u4EE5\u4E0A\u3002", requiredShots: 30, requiredCourses: 3, requiredTier: 3, focusKeys: [], requiredAttribute: 0, credits: 5, fame: 100 } : level <= 4 ? { id: prefixes + "elite", kind: "elite", name: "\u7CBE\u82F1\u57F9\u517B\u5408\u4F5C", description: "\u63A5\u53D6\u540E\u5B8C\u6210 40 \u6B21\u8BAD\u7EC3\u30014 \u8282\u8BFE\u7A0B\uFF0C\u5E76\u57F9\u517B\u5230\u5DE8\u661F\u53CA\u4EE5\u4E0A\u3002", requiredShots: 40, requiredCourses: 4, requiredTier: 4, focusKeys: [], requiredAttribute: 0, credits: 6, fame: 150 } : { id: prefixes + "legend", kind: "legend", name: "\u4F20\u5947\u57F9\u517B\u5408\u4F5C", description: "\u63A5\u53D6\u540E\u5B8C\u6210 50 \u6B21\u8BAD\u7EC3\u30015 \u8282\u8BFE\u7A0B\uFF0C\u5E76\u57F9\u517B\u5230\u4F20\u5947\u3002", requiredShots: 50, requiredCourses: 5, requiredTier: 5, focusKeys: [], requiredAttribute: 0, credits: 8, fame: 220 };
  return [basic, specialist, third];
}

// src/game/gym/progression.ts
var playerLevelCap = 99;
function requiredExperience(level) {
  if (!Number.isInteger(level) || level < 0 || level >= playerLevelCap) return 0;
  return Math.floor((400 + 120 * level + 3 * level * level + 19) / 20);
}
function experienceForLevel(targetLevel) {
  if (!Number.isInteger(targetLevel) || targetLevel < 0 || targetLevel > playerLevelCap) throw new Error("\u7403\u5458\u7B49\u7EA7\u65E0\u6548");
  let experience = 0;
  for (let level = 0; level < targetLevel; level++) experience += requiredExperience(level);
  return experience;
}
function shotExperience(outcome) {
  return outcome === "great" ? 20 : outcome === "success" ? 12 : 8;
}

// src/game/gym/consumables.ts
var chalkTrainingShots = 30;
var maximumStoredChalkShots = 50;
var teamSupplyRecovery = 10;
var gymConsumables = [
  { id: "drink", artId: "item_005", name: "\u8FD0\u52A8\u996E\u6599", price: 1, unlockLevel: 1, description: "\u6062\u590D\u5F53\u524D\u7403\u545810\u70B9\u4F53\u529B\uFF0C\u6700\u591A\u6062\u590D\u81F3\u4E0A\u9650\u3002", action: "\u6062\u590D10\u4F53\u529B" },
  { id: "chalk", artId: "item_003", name: "\u8BAD\u7EC3\u9541\u7C89", price: 2, unlockLevel: 3, description: `\u5F53\u524D\u7403\u5458\u63A5\u4E0B\u6765${chalkTrainingShots}\u6B21\u6295\u7BEE\u5747\u4E3A\u5927\u6210\u529F\uFF0C\u81EA\u52A8\u4E0E\u79BB\u7EBF\u4E5F\u751F\u6548\u3002\u4E0D\u53EF\u53E0\u52A0\uFF0C\u6548\u679C\u7ED1\u5B9A\u7403\u5458\uFF0C\u79BB\u9986\u540E\u7ED3\u675F\u3002`, action: "\u8FDE\u7EED\u5927\u6210\u529F" },
  { id: "supplement", artId: "item_004", name: "\u56E2\u961F\u8865\u7ED9", price: 3, unlockLevel: 3, description: `\u5168\u4F53\u672A\u6EE1\u7EA7\u5728\u8BAD\u7403\u5458\u5404\u6062\u590D${teamSupplyRecovery}\u4F53\u529B\uFF0C\u6700\u591A\u6062\u590D\u81F3\u5404\u81EA\u4E0A\u9650\u3002\u591A\u4EBA\u7F3A\u4F53\u529B\u65F6\u66F4\u5212\u7B97\u3002`, action: "\u5168\u5458\u6062\u590D10" }
];
var retiredGymConsumables = [
  { id: "brace", artId: "item_001", name: "\u5E94\u6025\u62A4\u5177", price: 3, unlockLevel: 2, description: "\u65E7\u7248\u5E93\u5B58\uFF1A\u5C06\u5F53\u524D\u7403\u5458\u7684\u4F53\u529B\u6062\u590D\u81F3\u4E0A\u9650\u3002", action: "\u56DE\u6EE1\u4F53\u529B", retired: true },
  { id: "timer", artId: "item_002", name: "\u52A0\u7EC3\u79D2\u8868", price: 2, unlockLevel: 2, description: "\u65E7\u7248\u5E93\u5B58\uFF1A\u7ACB\u5373\u52A0\u7EC3\u6700\u591A10\u7403\uFF0C\u9010\u7403\u8017\u4F53\u529B\uFF1B\u4EC5\u9650\u624B\u52A8\u8BAD\u7EC3\u3002", action: "\u7ACB\u5373\u52A0\u7EC3", retired: true }
];
var allGymConsumables = [...gymConsumables, ...retiredGymConsumables];
var consumableById = new Map(allGymConsumables.map((item) => [item.id, item]));

// src/game/gym/engine.ts
var shotCooldownMs = 500;
var drinkRecovery = 10;
function staminaRewardMethod(state) {
  return (state.staminaRewardCount ?? 0) === 0 ? "share" : "ad";
}
function consumableCount(state, id2) {
  return state.inventory[id2] ?? 0;
}
function guaranteedGreatShots(player2) {
  return player2?.greatShotsRemaining ?? (player2?.greatShotReady ? 1 : 0);
}
function consumableUseReason(state, id2) {
  const item = consumableById.get(id2);
  if (!item) return "\u6D88\u8017\u54C1\u4E0D\u5B58\u5728";
  const player2 = state.player;
  if (!player2) return "\u62DB\u52DF\u7403\u5458\u540E\u53EF\u4F7F\u7528";
  if (id2 === "supplement") {
    if (consumableCount(state, id2) < 1) return "\u56E2\u961F\u8865\u7ED9\u5DF2\u7528\u5B8C";
    const eligible = activePlayers(state).filter((trainee) => trainee.level < playerLevelCap);
    if (!eligible.length) return "\u6240\u6709\u7403\u5458\u5DF2\u6EE1\u7EA7\uFF0C\u8865\u7ED9\u7559\u7ED9\u540E\u7EED\u65B0\u4EBA\u4F7F\u7528";
    return eligible.some((trainee) => trainee.stamina < staminaMax(state)) ? "" : "\u5168\u4F53\u53EF\u8BAD\u7EC3\u7403\u5458\u4F53\u529B\u5DF2\u6EE1";
  }
  if (player2.level >= playerLevelCap) return `\u7403\u5458\u5DF2\u8FBE\u5230 ${playerLevelCap} \u7EA7\u8BAD\u7EC3\u4E0A\u9650\uFF0C\u65E0\u9700\u4F7F\u7528${item.name}`;
  if (consumableCount(state, id2) < 1) return `${item.name}\u5DF2\u7528\u5B8C`;
  if ((id2 === "drink" || id2 === "brace") && player2.stamina >= staminaMax(state)) return "\u5F53\u524D\u4F53\u529B\u5DF2\u6EE1";
  if (id2 === "timer" && player2.autoEnabled) return "\u8BF7\u5148\u6682\u505C\u81EA\u52A8\u8BAD\u7EC3\u518D\u4F7F\u7528\u52A0\u7EC3\u79D2\u8868";
  if (id2 === "timer" && player2.stamina < 1) return "\u4F53\u529B\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u52A0\u7EC3";
  if (id2 === "chalk" && guaranteedGreatShots(player2) > 0) return `\u9541\u7C89\u8FD8\u53EF\u751F\u6548${guaranteedGreatShots(player2)}\u7403\uFF0C\u7528\u5B8C\u540E\u518D\u4F7F\u7528`;
  return "";
}
function automaticIntervalMs(state) {
  return Math.max(1e3, 2e3 - state.projects.automation * 200);
}
function trainingShotExperience(state, outcome, player2 = state.player) {
  const equipment2 = equipmentEffects(state);
  return shotExperience(outcome) + equipment2.experience + (player2?.autoEnabled ? equipment2.automationExperience + (state.offlineRulesVersion === 2 ? state.projects.automation : 0) : 0);
}
function activePlayers(state) {
  return state.player ? [state.player, ...state.bench] : [...state.bench];
}
function courseRecoveryCap(state) {
  return [1, 1, 2, 2, 2, 3, 3, 3][state.gymLevel - 1] ?? 1;
}
var tierIds = [null, "rotation", "starter", "star", "superstar", "legend"];
var tierNames = ["\u5F85\u53D1\u6398", "\u66FF\u8865", "\u9996\u53D1", "\u5168\u660E\u661F", "\u5DE8\u661F", "\u4F20\u5947"];
var catalogById = new Map(equipmentCatalog.map((item) => [item.id, item]));
var legacyCatalogById = new Map(legacyEquipmentCatalog.map((item) => [item.id, item]));
var projectById = new Map(projects.map((project) => [project.id, project]));
var rating = (stats3) => statKeys.reduce((sum, key) => sum + stats3[key], 0) / statKeys.length;
var validTime = (now) => Number.isSafeInteger(now) && now >= 0;
function equipmentEffects(state) {
  if (state.pendingLegacyEquipmentEffects) return { ...state.pendingLegacyEquipmentEffects, focus: { ...state.pendingLegacyEquipmentEffects.focus } };
  const families = /* @__PURE__ */ new Map();
  for (const id2 of state.equippedEquipment) {
    const item = state.ownedEquipment.includes(id2) ? catalogById.get(id2) : void 0;
    const previous = item && families.get(item.family);
    if (item && (!previous || item.grade > previous.grade)) families.set(item.family, item);
  }
  const effects = [...families.values()].reduce((effects2, item) => {
    effects2.stamina += item.effects.stamina;
    effects2.recovery += item.effects.recovery;
    effects2.valuePercent += item.effects.valuePercent;
    if (item.effects.focusKey) effects2.focus[item.effects.focusKey] += item.effects.focusPower;
    effects2.courseRecovery += item.effects.courseRecovery;
    effects2.cooperationBonus += item.effects.cooperationBonus;
    effects2.experience += item.effects.experience;
    effects2.automationExperience += item.effects.automationExperience;
    effects2.offlineMinutes += item.effects.offlineMinutes;
    return effects2;
  }, {
    stamina: 0,
    recovery: 0,
    valuePercent: 0,
    focus: Object.fromEntries(statKeys.map((key) => [key, 0])),
    courseRecovery: 0,
    cooperationBonus: 0,
    experience: 0,
    automationExperience: 0,
    offlineMinutes: 0
  });
  effects.stamina = Math.min(20, effects.stamina);
  effects.recovery = Math.min(4, effects.recovery);
  effects.courseRecovery = Math.min(courseRecoveryCap(state), effects.courseRecovery);
  effects.cooperationBonus = Math.min(2, effects.cooperationBonus);
  effects.experience = Math.min(3, effects.experience);
  effects.automationExperience = Math.min(3, effects.automationExperience);
  effects.offlineMinutes = Math.min(60, effects.offlineMinutes);
  for (const key of statKeys) effects.focus[key] = Math.min(1.5, effects.focus[key]);
  return effects;
}
function staminaMax(state) {
  return 20 + state.projects.endurance * 5 + equipmentEffects(state).stamina;
}
function recoverySeconds(state) {
  return Math.max(6, 20 - state.projects.recovery - equipmentEffects(state).recovery);
}
function equipmentCapacity(state) {
  return Math.min(8, 4 + state.projects.equipment);
}
function legacyEquipmentPurchasePrice(id2) {
  const item = legacyCatalogById.get(id2);
  if (!item) return 0;
  const number = Number(id2.slice(6));
  return item.rarity === "common" ? 1 + number % 2 : item.rarity === "rare" ? 3 + number % 3 : 8 + number % 5;
}
function equipmentSaleValue(state, id2) {
  if (!state.ownedEquipment.includes(id2)) return 0;
  return Math.floor((state.purchasePrices?.[id2] ?? legacyEquipmentPurchasePrice(id2)) / 2);
}
function equippedFamilyEquipment(state, itemId) {
  const family = catalogById.get(itemId)?.family;
  return family ? state.equippedEquipment.map((id2) => catalogById.get(id2)).find((item) => item?.family === family && item.id !== itemId) : void 0;
}
function installationError(state, itemId, replaceId) {
  if (replaceId !== void 0 && !state.equippedEquipment.includes(replaceId)) return "\u88AB\u66FF\u6362\u7684\u5668\u6750\u5DF2\u4E0D\u5728\u9986\u5185\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9";
  const familyItem = equippedFamilyEquipment(state, itemId);
  if (familyItem && replaceId !== familyItem.id) return "\u540C\u7C7B\u5668\u6750\u4EC5\u80FD\u542F\u7528\u4E00\u4EF6\uFF0C\u8BF7\u9009\u62E9\u66FF\u6362\u540C\u7C7B\u5668\u6750\uFF0C\u65E7\u4EF6\u8FDB\u5165\u4ED3\u5E93";
  if (replaceId === void 0 && state.equippedEquipment.length >= equipmentCapacity(state)) return "\u9986\u5185\u5668\u6750\u5DF2\u6EE1\uFF0C\u8BF7\u9009\u62E9\u4E00\u4EF6\u66FF\u6362\u5165\u4ED3\u5E93";
  return null;
}
function installEquipment(state, id2, replaceId, events) {
  if (replaceId !== void 0) {
    state.equippedEquipment = state.equippedEquipment.filter((active) => active !== replaceId);
    events.push({ type: "unequipped", id: replaceId });
  }
  state.equippedEquipment.push(id2);
  events.push({ type: "equipped", id: id2 });
}
function playerValue(state, player2 = state.player) {
  if (!player2) return "0";
  return (320n * BigInt(player2.level + 1) ** 3n * BigInt(100 + equipmentEffects(state).valuePercent) / 100n).toString();
}
function effectiveTrainingBias(state, player2 = state.player) {
  const focus = equipmentEffects(state).focus;
  if (player2 && !state.pendingLegacyEquipmentEffects) {
    for (const key of statKeys) if (player2.stats[key] >= 99) focus[key] = 0;
  }
  return player2 ? trainingBias(player2.bias, player2.training.planId, focus) : Object.fromEntries(statKeys.map((key) => [key, 0]));
}
function trainingStatus(state, player2 = state.player) {
  const training2 = player2?.training ?? { planId: "balanced", shots: 0, completedCourses: 0 };
  const plan = trainingPlans.find((plan2) => plan2.id === training2.planId);
  const recovery = 4 + equipmentEffects(state).courseRecovery;
  return { plan, shots: training2.shots, completedCourses: training2.completedCourses, recovery, nextRecovery: recovery };
}
var cooperationOffers = buildCooperationOffers;
function cooperationStatus(state, player2 = state.player) {
  const active = player2?.cooperation;
  const offer = player2 && active?.playerId === player2.id ? cooperationOffers(state, player2).find((offer2) => offer2.id === active.id) ?? null : null;
  if (!player2 || !active || !offer) return { offer: null, requirements: [], complete: false, rewardCredits: 0, rewardFame: 0, equipmentCredits: 0 };
  const newShots = Math.max(0, player2.shots - active.acceptedShots);
  const newCourses = Math.max(0, player2.training.completedCourses - active.acceptedCourses);
  const tier = tierIds.indexOf(templateById(player2.templateId)?.tier ?? null);
  const requirements = [
    { label: "\u63A5\u53D6\u540E\u8BAD\u7EC3", current: newShots, required: offer.requiredShots, met: newShots >= offer.requiredShots },
    { label: "\u63A5\u53D6\u540E\u8BFE\u7A0B", current: newCourses, required: offer.requiredCourses, met: newCourses >= offer.requiredCourses },
    { label: `\u6A21\u677F\u6863\u6B21\uFF08${tierNames[offer.requiredTier]}\u53CA\u4EE5\u4E0A\uFF09`, current: tier, required: offer.requiredTier, met: tier >= offer.requiredTier },
    ...offer.focusKeys.map((key) => ({ label: statLabels[key], current: player2.stats[key], required: offer.requiredAttribute, met: player2.stats[key] >= offer.requiredAttribute }))
  ];
  const complete = active.adCompleted === true || requirements.every((requirement) => requirement.met);
  const eligible = player2.equipmentTraining.cooperationCourses;
  const equipmentCredits = complete ? eligible[1] >= 2 ? 2 : eligible[0] >= 2 ? 1 : 0 : 0;
  return { offer, requirements, complete, rewardCredits: offer.credits + equipmentCredits, rewardFame: offer.fame, equipmentCredits };
}
function recommendation(source, selected) {
  const player2 = source && "kind" in source ? selected === void 0 ? source.player : selected : source;
  const tierId = templateById(player2?.templateId)?.tier ?? null;
  const tier = tierIds.indexOf(tierId);
  const growth = player2 ? statKeys.reduce((sum, key) => sum + Math.max(0, player2.stats[key] - player2.entryStats[key]), 0) : 0;
  const courses = player2?.training.completedCourses ?? 0;
  const trainingCredits = trainingCreditMilestones.reduce((earned, milestone) => player2 && player2.level >= milestone.level && tier >= milestone.tier ? milestone.credits : earned, 0);
  const state = source && "kind" in source ? source : null;
  const rawFame = Math.floor(growth * (tier + 1) / 10);
  const coursePercent = 100 + Math.min(60, courses * 10);
  const brandShots = state && player2 ? player2.equipmentTraining.brandShots : 0;
  const brandTotal = state && player2 ? player2.equipmentTraining.brandTotal : 0;
  const baseFame = brandShots ? Number(BigInt(rawFame) * (BigInt(coursePercent) * BigInt(brandShots) + BigInt(brandTotal)) / (100n * BigInt(brandShots))) : Math.floor(rawFame * coursePercent / 100);
  const cooperation = state && player2 ? cooperationStatus(state, player2) : null;
  const cooperationCredits = cooperation?.complete ? cooperation.rewardCredits : 0;
  const cooperationFame = cooperation?.complete ? cooperation.rewardFame : 0;
  return {
    credits: tier + trainingCredits + cooperationCredits,
    fame: baseFame + cooperationFame,
    growth,
    tier,
    tierId,
    tierName: tierNames[tier],
    baseCredits: tier,
    trainingCredits,
    cooperationCredits,
    rawFame,
    baseFame,
    cooperationFame
  };
}
function recommendedTemplateIds(state) {
  if (state.recommendationRulesVersion === 11) return state.postgameRecommendedTemplates ?? [];
  const ids = new Set(state.postgameRecommendedTemplates ?? []);
  for (const player2 of state.alumni) if (player2.templateId && templateById(player2.templateId)) ids.add(player2.templateId);
  return [...ids];
}
function initializeRecommendationRecords(state, archivedIds = []) {
  if (state.recommendationRulesVersion === 11) return state;
  const ids = new Set(recommendedTemplateIds(state));
  for (const id2 of archivedIds) if (templateById(id2)) ids.add(id2);
  return { ...state, recommendationRulesVersion: 11, postgameRecommendedTemplates: [...ids] };
}
function recommendationPayout(state, player2 = state.player) {
  const raw = recommendation(state, player2);
  const eligible = !!player2?.templateId && raw.tierId !== null;
  const repeatTemplate = eligible && recommendedTemplateIds(state).includes(player2.templateId);
  const isFirstPostgameRecommendation = eligible && !repeatTemplate;
  const baseCredits = repeatTemplate ? postgameRepeatTemplateCredits : raw.baseCredits;
  const credits = !eligible ? 0 : baseCredits + raw.trainingCredits + raw.cooperationCredits;
  return { ...raw, baseCredits, credits, rawCredits: raw.credits, withheldCredits: raw.credits - credits, repeatTemplate, isFirstPostgameRecommendation };
}
function projectCost(id2, nextLevel) {
  const project = projectById.get(id2);
  if (!project || !Number.isInteger(nextLevel) || nextLevel < 1 || nextLevel > project.maxLevel) throw new Error("\u9879\u76EE\u7B49\u7EA7\u65E0\u6548");
  const explicitPrice = project.prices?.[nextLevel - 1];
  if (explicitPrice !== void 0) return explicitPrice;
  const denominator = 5 ** (nextLevel - 1);
  const numerator = project.basePrice * 9 ** (nextLevel - 1);
  return Math.floor((numerator + denominator - 1) / denominator);
}
function projectCap(id2, gymLevel) {
  const project = projectById.get(id2);
  return project ? Math.min(project.maxLevel, Math.max(0, gymLevel - project.unlockLevel + 1)) : 0;
}
function projectOffer(state, id2) {
  const project = projectById.get(id2);
  const level = project ? state.projects[project.id] : 0;
  const maxLevel = projectCap(id2, state.gymLevel);
  let reason = null;
  if (!project) reason = "\u9879\u76EE\u4E0D\u5B58\u5728";
  else if (!project.available) reason = "\u540E\u7EED\u7248\u672C\u5F00\u653E\uFF0C\u5F53\u524D\u4E0D\u53EF\u8D2D\u4E70";
  else if (state.gymLevel < project.unlockLevel) reason = `\u7403\u9986\u8FBE\u5230 ${project.unlockLevel} \u7EA7\u540E\u5F00\u653E`;
  else if (level >= project.maxLevel) reason = "\u9879\u76EE\u5DF2\u8FBE\u5230\u6700\u9AD8\u7B49\u7EA7";
  else if (level >= maxLevel) reason = "\u5347\u7EA7\u7403\u9986\u540E\u5F00\u653E\u4E0B\u4E00\u7B49\u7EA7";
  return { level, maxLevel, price: reason || !project ? null : projectCost(id2, level + 1), reason };
}
function equipmentOffer(state, id2) {
  const item = catalogById.get(id2);
  const owned = state.ownedEquipment.includes(id2);
  let reason = null;
  if (!item) reason = "\u5668\u6750\u4E0D\u5B58\u5728";
  else if (owned) reason = "\u5DF2\u83B7\u5F97\u8BE5\u5668\u6750";
  else if (state.gymLevel < item.unlockLevel) reason = `\u7403\u9986\u8FBE\u5230 ${item.unlockLevel} \u7EA7\u540E\u4E0A\u67B6`;
  else if (Object.keys(state.collection).length < item.requiredTemplates) reason = `\u6536\u5F55 ${item.requiredTemplates} \u79CD\u6A21\u677F\u540E\u4E0A\u67B6`;
  return { owned, price: reason || !item ? null : item.price, reason };
}
function alumniCount(state) {
  return state.alumni.length + (state.alumniArchive?.count ?? 0);
}
function alumniProgress(state) {
  let effectiveCount = state.alumniArchive?.effectiveCount ?? 0;
  let legendCount = state.alumniArchive?.legendCount ?? 0;
  let bestTier = state.alumniArchive?.bestTier ?? 0;
  for (const player2 of state.alumni) {
    const reward = recommendation(player2);
    if (reward.growth <= 0 || reward.tier < 1) continue;
    effectiveCount++;
    if (reward.tier === 5) legendCount++;
    bestTier = Math.max(bestTier, reward.tier);
  }
  return { total: alumniCount(state), effectiveCount, legendCount, bestTier };
}
function gymUpgrade(state) {
  const level = gymLevels[state.gymLevel] ?? null;
  const progress = alumniProgress(state);
  const requirements = [];
  const add = (label, current, required) => {
    if (required) requirements.push({ label, current, required, met: current >= required });
  };
  if (level) {
    add("\u7D2F\u8BA1\u58F0\u671B", state.fame, level.fame);
    add("\u6709\u6548\u63A8\u8350", progress.effectiveCount, level.requiredRecommendations);
    add(`\u6700\u9AD8\u63A8\u8350\u6863\u6B21\uFF08${tierNames[level.requiredTier]}\u53CA\u4EE5\u4E0A\uFF09`, progress.bestTier, level.requiredTier);
    add("\u4F20\u5947\u63A8\u8350\u4EBA\u6570", progress.legendCount, level.requiredLegends);
    add("\u7403\u661F\u6A21\u677F\u6536\u85CF", Object.keys(state.collection).length, level.requiredTemplates);
  }
  const progressMet = !!level && requirements.every((requirement) => requirement.met);
  const price = level?.upgradePrice ?? 0;
  if (level) add("\u6269\u5EFA\u8D5E\u52A9\u5238", state.credits, price);
  const canUpgrade = progressMet && state.credits >= price;
  const reason = !level ? "\u7403\u9986\u5DF2\u8FBE\u5230\u6700\u9AD8\u7B49\u7EA7" : canUpgrade ? "" : !progressMet ? "\u58F0\u671B\u6216\u57F9\u517B\u6210\u679C\u5C1A\u672A\u8FBE\u6807" : `\u8D5E\u52A9\u5238\u4E0D\u8DB3\uFF0C\u8FD8\u5DEE ${price - state.credits} \u5238`;
  return { level, price, requirements, canUpgrade, reason };
}
function recruit(state, preference, direction) {
  const source = state.rng.recruits;
  let baseStats = Object.fromEntries(statKeys.map((key) => [key, 24 + Math.floor(random(source) * 25)]));
  const bias = Object.fromEntries(statKeys.map((key) => [key, random(source) ** 3]));
  const ranges = { any: [178, 218], guard: [178, 194], forward: [195, 205], center: [206, 218] };
  const [low, high] = ranges[preference];
  const height = low + Math.floor(random(source) * (high - low + 1));
  if (direction) baseStats = selectedRecruitmentBase(baseStats, direction, source);
  const stats3 = Object.fromEntries(statKeys.map((key) => [key, baseStats[key] + state.projects.recruitment]));
  const sequence = state.nextPlayer++;
  const id2 = `gym-p${sequence}`;
  return {
    id: id2,
    name: `\u65B0\u79C0 ${sequence}`,
    enteredAt: state.updatedAt,
    height,
    stats: stats3,
    entryStats: { ...stats3 },
    bias,
    lastStyle: shape(stats3),
    matchSeed: hash(`${state.seed}:${id2}`),
    level: 0,
    peakLevel: 0,
    templateId: null,
    highestTier: null,
    shots: 0,
    book: ledger(),
    stamina: staminaMax(state),
    recoveryMs: 0,
    enteredGymLevel: state.gymLevel,
    training: { planId: "balanced", shots: 0, completedCourses: 0 },
    experience: 0,
    nextShotAt: state.updatedAt,
    autoEnabled: false,
    cooperation: null,
    equipmentTraining: { brandTotal: 0, brandShots: 0, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0] }
  };
}
function newGym(now, seed = 1) {
  if (!validTime(now) || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("\u7403\u9986\u521D\u59CB\u5316\u53C2\u6570\u65E0\u6548");
  const state = {
    kind: "gym-management",
    version: 1,
    balanceVersion: 3,
    equipmentCatalogVersion,
    offlineRulesVersion: 2,
    seed,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    nextPlayer: 1,
    player: null,
    bench: [],
    credits: 0,
    fame: 0,
    gymLevel: 1,
    projects: { endurance: 0, recovery: 0, recruitment: 0, equipment: 0, automation: 0, offline: 0 },
    ownedEquipment: [],
    equippedEquipment: [],
    purchasePrices: {},
    inventory: { drink: 0 },
    collection: {},
    collectedEquipment: {},
    alumni: [],
    recommendationRulesVersion: 11,
    postgameRecommendedTemplates: [],
    rng: { recruits: stream(seed, "recruits"), economy: stream(seed, "economy"), attributes: stream(seed, "attributes") }
  };
  state.player = recruit(state, "any");
  return state;
}
function advanceGym(state, now) {
  if (!validTime(now) || now <= state.updatedAt) return state;
  const maximum = staminaMax(state);
  const interval = recoverySeconds(state) * 1e3;
  const elapsed = now - state.updatedAt;
  const recover = (source) => {
    const player2 = { ...source };
    const needed = (maximum - player2.stamina) * interval - player2.recoveryMs;
    if (player2.stamina >= maximum || elapsed >= needed) {
      player2.stamina = maximum;
      player2.recoveryMs = 0;
    } else {
      const accumulated = player2.recoveryMs + elapsed;
      player2.stamina += Math.floor(accumulated / interval);
      player2.recoveryMs = accumulated % interval;
    }
    return player2;
  };
  return {
    ...state,
    updatedAt: now,
    revision: state.revision + 1,
    player: state.player ? recover(state.player) : null,
    bench: state.bench.map(recover)
  };
}
function reconcileRecovery(before, after) {
  for (const player2 of activePlayers(after)) {
    player2.stamina = Math.min(player2.stamina, staminaMax(after));
    player2.recoveryMs = player2.stamina >= staminaMax(after) ? 0 : Math.floor(player2.recoveryMs * recoverySeconds(after) / recoverySeconds(before));
  }
}
function finishEquipmentMigration(state) {
  if (!state.pendingLegacyEquipmentEffects) return state;
  const next = cloneData(state);
  delete next.pendingLegacyEquipmentEffects;
  reconcileRecovery(state, next);
  return next;
}
function rememberPlayer(state, events, player2 = state.player) {
  if (!player2?.templateId) return;
  const previous = state.collection[player2.templateId];
  const value = playerValue(state, player2);
  state.collection[player2.templateId] = {
    firstAt: previous?.firstAt ?? state.updatedAt,
    highestRating: Math.max(previous?.highestRating ?? 0, rating(player2.stats)),
    highestValue: previous && BigInt(previous.highestValue) > BigInt(value) ? previous.highestValue : value
  };
  if (!previous) events.push({ type: "template-unlocked", templateId: player2.templateId, playerId: player2.id });
}
function addPlayerExperience(state, player2, experience) {
  const before = player2.level;
  player2.experience += experience;
  while (player2.level < playerLevelCap && player2.experience >= requiredExperience(player2.level)) {
    player2.experience -= requiredExperience(player2.level);
    player2.level++;
  }
  if (player2.level === playerLevelCap) player2.experience = 0;
  const levelGain = player2.level - before;
  if (levelGain > 0) player2.stats = grow(player2.stats, effectiveTrainingBias(state, player2), "success", levelGain, state.rng.attributes);
  player2.peakLevel = Math.max(player2.peakLevel, player2.level);
  return levelGain;
}
function trainPlayer(state, player2, now, events, reuseMatching = false) {
  const cooperationWasComplete = cooperationStatus(state, player2).complete;
  const roll = random(state.rng.economy);
  const guaranteed = guaranteedGreatShots(player2);
  const outcome = guaranteed > 0 ? "great" : roll < 0.3 ? "hold" : roll < 0.9 ? "success" : "great";
  if (guaranteed > 1) player2.greatShotsRemaining = guaranteed - 1;
  else delete player2.greatShotsRemaining;
  delete player2.greatShotReady;
  const experienceGain = trainingShotExperience(state, outcome, player2);
  const equipment2 = equipmentEffects(state);
  player2.equipmentTraining.brandShots++;
  player2.equipmentTraining.brandTotal += Math.min(50, equipment2.valuePercent);
  if (player2.cooperation) {
    for (let tier = 1; tier <= 2; tier++) if (equipment2.cooperationBonus >= tier) {
      player2.equipmentTraining.cooperationCourseShots[tier - 1]++;
    }
  }
  const previousStats = { ...player2.stats };
  const previousTemplate = player2.templateId;
  const levelGain = addPlayerExperience(state, player2, experienceGain);
  player2.stamina--;
  player2.shots++;
  player2.training.shots++;
  let restoredStamina = null;
  if (player2.training.shots === 10) {
    player2.training.shots = 0;
    player2.training.completedCourses++;
    if (player2.cooperation) {
      for (let tier = 1; tier <= 2; tier++) if (player2.equipmentTraining.cooperationCourseShots[tier - 1] === 10) {
        player2.equipmentTraining.cooperationCourses[tier - 1] = Math.min(2, player2.equipmentTraining.cooperationCourses[tier - 1] + 1);
      }
    }
    player2.equipmentTraining.cooperationCourseShots = [0, 0];
    restoredStamina = Math.min(trainingStatus(state, player2).nextRecovery, staminaMax(state) - player2.stamina);
    player2.stamina += restoredStamina;
    if (player2.stamina === staminaMax(state)) player2.recoveryMs = 0;
  }
  player2.nextShotAt = now + (player2.autoEnabled ? automaticIntervalMs(state) : shotCooldownMs);
  if (player2.level === playerLevelCap) player2.autoEnabled = false;
  if (!reuseMatching || levelGain > 0) {
    const matched = match(player2);
    player2.templateId = matched.templateId;
    player2.lastStyle = matched.lastStyle;
    if (tierIds.indexOf(matched.tier) > tierIds.indexOf(player2.highestTier)) player2.highestTier = matched.tier;
  }
  const changes = Object.fromEntries(statKeys.map((key) => [key, player2.stats[key] - previousStats[key]]));
  events.push({ type: "trained", playerId: player2.id, outcome, changes, levelGain, experienceGain });
  if (restoredStamina !== null) events.push({ type: "course-completed", playerId: player2.id, restoredStamina });
  if (player2.templateId !== previousTemplate) events.push({ type: "template-changed", playerId: player2.id, templateId: player2.templateId ?? void 0 });
  rememberPlayer(state, events, player2);
  if (!cooperationWasComplete && cooperationStatus(state, player2).complete) {
    events.push({ type: "cooperation-ready", playerId: player2.id, id: player2.cooperation.id });
  }
}
function offlineBonusExperience(state, report) {
  const players = activePlayers(state), ceiling = experienceForLevel(playerLevelCap);
  return Object.fromEntries(report.players.map((earned) => {
    const trainee = players.find((player2) => player2.id === earned.id);
    const remaining = trainee ? Math.max(0, ceiling - experienceForLevel(trainee.level) - trainee.experience) : 0;
    return [earned.id, Math.min(earned.xpGained, remaining)];
  }));
}
function dispatchGym(original, expectedRevision, action, now) {
  const fail = (error) => ({ state: original, events: [], error });
  if (expectedRevision !== original.revision) return fail("\u64CD\u4F5C\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u8BD5");
  if (!validTime(now) || now < original.updatedAt) return fail("\u5F53\u524D\u65F6\u95F4\u65E0\u6548");
  const timed = advanceGym(original, now);
  const next = cloneData(timed);
  const events = [];
  const player2 = next.player;
  switch (action.type) {
    case "double-offline-experience": {
      const reward = next.offlineReward;
      if (!reward || reward.report.reportId !== action.reportId) return fail("\u79BB\u7EBF\u62A5\u544A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u540E\u9886\u53D6");
      if (reward.claimed) return fail("\u8FD9\u4EFD\u62A5\u544A\u5DF2\u9886\u53D6\u53CC\u500D\u7ECF\u9A8C");
      if (reward.dismissed) return fail("\u8FD9\u4EFD\u79BB\u7EBF\u62A5\u544A\u5DF2\u7ED3\u675F");
      const bonusExperience = offlineBonusExperience(next, reward.report);
      if (!Object.values(bonusExperience).some((value) => value > 0)) return fail("\u7403\u5458\u5DF2\u8FBE\u523099\u7EA7\uFF0C\u65E0\u9700\u9886\u53D6\u989D\u5916\u7ECF\u9A8C");
      for (const earned of reward.report.players) {
        const trainee = activePlayers(next).find((entry) => entry.id === earned.id);
        if (!trainee) return fail("\u62A5\u544A\u4E2D\u7684\u7403\u5458\u5DF2\u79BB\u9986\uFF0C\u672A\u53D1\u653E\u5956\u52B1");
        const bonus = bonusExperience[earned.id];
        if (!bonus) continue;
        const before = { ...trainee.stats };
        const levelGain = addPlayerExperience(next, trainee, bonus);
        if (trainee.level === playerLevelCap) trainee.autoEnabled = false;
        const previousTemplate = trainee.templateId, matched = match(trainee);
        trainee.templateId = matched.templateId;
        trainee.lastStyle = matched.lastStyle;
        if (tierIds.indexOf(matched.tier) > tierIds.indexOf(trainee.highestTier)) trainee.highestTier = matched.tier;
        events.push({
          type: "offline-experience-doubled",
          playerId: trainee.id,
          experienceGain: bonus,
          levelGain,
          changes: Object.fromEntries(statKeys.map((key) => [key, trainee.stats[key] - before[key]]))
        });
        if (previousTemplate !== trainee.templateId) events.push({ type: "template-changed", playerId: trainee.id, templateId: trainee.templateId ?? void 0 });
        rememberPlayer(next, events, trainee);
      }
      reward.report.bonusExperience = bonusExperience;
      reward.claimed = true;
      break;
    }
    case "dismiss-offline-report": {
      if (!next.offlineReward || next.offlineReward.report.reportId !== action.reportId) return fail("\u79BB\u7EBF\u62A5\u544A\u5DF2\u53D8\u5316");
      next.offlineReward.dismissed = true;
      break;
    }
    case "train": {
      if (!player2 || action.id !== player2.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (player2.autoEnabled) return fail("\u8BF7\u5148\u5173\u95ED\u8BE5\u7403\u5458\u7684\u81EA\u52A8\u8BAD\u7EC3");
      if (player2.level >= playerLevelCap) return fail("\u7403\u5458\u5DF2\u8FBE\u5230 99 \u7EA7\u8BAD\u7EC3\u4E0A\u9650");
      if (now < player2.nextShotAt) return fail("\u4E0B\u4E00\u7403\u6B63\u5728\u51C6\u5907");
      if (player2.stamina < 1) return fail("\u4F53\u529B\u4E0D\u8DB3\uFF0C\u8BF7\u7B49\u5F85\u4F53\u529B\u6062\u590D\u6216\u9886\u53D6\u4F53\u529B\u5956\u52B1");
      trainPlayer(next, player2, now, events);
      break;
    }
    case "auto-step": {
      if (next.gymLevel < 2) return { state: timed, events };
      const due = activePlayers(next).filter((player3) => player3.autoEnabled && player3.level < playerLevelCap && player3.nextShotAt <= now && player3.stamina >= 1).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (!due.length) return { state: timed, events };
      for (const trainee of due) trainPlayer(next, trainee, now, events);
      break;
    }
    case "select-player": {
      if (player2?.id === action.id) return fail("\u5F53\u524D\u5DF2\u9009\u62E9\u8BE5\u7403\u5458");
      const index = next.bench.findIndex((trainee) => trainee.id === action.id);
      if (index < 0) return fail("\u8BE5\u7403\u5458\u5DF2\u4E0D\u5728\u8BAD\u7EC3\u9986");
      next.player = next.bench[index];
      if (player2) next.bench[index] = player2;
      else next.bench.splice(index, 1);
      events.push({ type: "player-selected", playerId: action.id });
      break;
    }
    case "set-auto": {
      const trainee = activePlayers(next).find((trainee2) => trainee2.id === action.id);
      if (!trainee) return fail("\u8BE5\u7403\u5458\u5DF2\u4E0D\u5728\u8BAD\u7EC3\u9986");
      if (typeof action.enabled !== "boolean") return fail("\u81EA\u52A8\u8BAD\u7EC3\u8BBE\u7F6E\u65E0\u6548");
      if (action.enabled && next.gymLevel < 2) return fail("\u7403\u9986 2 \u7EA7\u5F00\u653E\u81EA\u52A8\u8BAD\u7EC3");
      if (action.enabled && trainee.level >= playerLevelCap) return fail("\u7403\u5458\u5DF2\u8FBE\u5230 99 \u7EA7\u8BAD\u7EC3\u4E0A\u9650");
      if (trainee.autoEnabled === action.enabled) return fail("\u5F53\u524D\u5DF2\u4F7F\u7528\u8BE5\u8BAD\u7EC3\u6A21\u5F0F");
      trainee.autoEnabled = action.enabled;
      trainee.nextShotAt = Math.max(trainee.nextShotAt, now + (action.enabled ? automaticIntervalMs(next) : shotCooldownMs));
      events.push({ type: "auto-changed", playerId: trainee.id });
      break;
    }
    case "recommend": {
      if (!player2 || action.id !== player2.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u65E0\u6CD5\u91CD\u590D\u63A8\u8350");
      if (next.recommendationRulesVersion !== 11 && next.alumniArchive?.count) return fail("\u63A8\u8350\u8BB0\u5F55\u5C1A\u672A\u6062\u590D\uFF0C\u8BF7\u91CD\u65B0\u8FDB\u5165\u7403\u9986\u540E\u91CD\u8BD5");
      const reward = recommendationPayout(next, player2);
      if (!Number.isSafeInteger(next.credits + reward.credits) || !Number.isSafeInteger(next.fame + reward.fame)) return fail("\u7ECF\u8425\u8BB0\u5F55\u5DF2\u8FBE\u5230\u6570\u503C\u4E0A\u9650");
      if (next.recommendationRulesVersion !== 11) {
        const initialized = initializeRecommendationRecords(next);
        next.recommendationRulesVersion = initialized.recommendationRulesVersion;
        next.postgameRecommendedTemplates = initialized.postgameRecommendedTemplates;
      }
      if (reward.isFirstPostgameRecommendation) next.postgameRecommendedTemplates = [...next.postgameRecommendedTemplates ?? [], player2.templateId];
      if (reward.tierId !== null) next.alumni.push({ ...player2, recommendedAt: now, rewardCredits: reward.credits, rewardFame: reward.fame, finalValue: playerValue(next, player2) });
      next.credits += reward.credits;
      next.fame += reward.fame;
      next.player = next.bench.shift() ?? null;
      events.push({
        type: "recommended",
        playerId: player2.id,
        credits: reward.credits,
        fame: reward.fame,
        rawCredits: reward.rawCredits,
        withheldCredits: reward.withheldCredits,
        repeatTemplate: reward.repeatTemplate,
        isFirstPostgameRecommendation: reward.isFirstPostgameRecommendation
      });
      break;
    }
    case "recruit": {
      if (action.mode !== void 0 && action.mode !== "selected") return fail("\u62DB\u751F\u65B9\u5F0F\u65E0\u6548");
      if (action.selectRecruited !== void 0 && typeof action.selectRecruited !== "boolean") return fail("\u62DB\u751F\u9009\u62E9\u65E0\u6548");
      if (action.expectedNextPlayer !== void 0 && (!Number.isSafeInteger(action.expectedNextPlayer) || action.expectedNextPlayer !== next.nextPlayer)) return fail("\u62DB\u751F\u540D\u5355\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4");
      if (activePlayers(next).length >= next.gymLevel) return fail("\u8BAD\u7EC3\u4F4D\u5DF2\u6EE1\uFF0C\u5347\u7EA7\u7403\u9986\u6216\u63A8\u8350\u4E00\u540D\u7403\u5458\u540E\u518D\u62DB\u52DF");
      const preference = action.preference ?? "any";
      if (!["any", "guard", "forward", "center"].includes(preference)) return fail("\u8EAB\u9AD8\u504F\u597D\u65E0\u6548");
      if (preference !== "any" && next.gymLevel < 2) return fail("\u7403\u9986 2 \u7EA7\u5F00\u653E\u8EAB\u9AD8\u504F\u597D");
      const selected = action.mode === "selected";
      if (selected && action.expectedNextPlayer === void 0) return fail("\u8BF7\u91CD\u65B0\u786E\u8BA4\u7CBE\u9009\u62DB\u751F\u540D\u5355");
      if (selected && !isSelectedRecruitmentDirection(action.direction)) return fail("\u7CBE\u9009\u65B9\u5411\u65E0\u6548");
      if (!selected && action.direction !== void 0) return fail("\u514D\u8D39\u62DB\u751F\u65E0\u9700\u9009\u62E9\u7CBE\u9009\u65B9\u5411");
      if (selected && next.gymLevel < selectedRecruitmentUnlockLevel) return fail(`\u7403\u9986 ${selectedRecruitmentUnlockLevel} \u7EA7\u5F00\u653E\u7CBE\u9009\u62DB\u751F`);
      if (selected && next.credits < selectedRecruitmentPrice) return fail("\u8D5E\u52A9\u5238\u4E0D\u8DB3");
      if (!Number.isSafeInteger(next.nextPlayer + 1)) return fail("\u62DB\u751F\u8BB0\u5F55\u5DF2\u8FBE\u5230\u6570\u503C\u4E0A\u9650");
      const trainee = recruit(next, preference, selected ? action.direction : void 0);
      if (selected) next.credits -= selectedRecruitmentPrice;
      trainee.nextShotAt = Math.max(trainee.nextShotAt, now + shotCooldownMs);
      if (player2 && action.selectRecruited) {
        next.bench.push(player2);
        next.player = trainee;
      } else if (player2) next.bench.push(trainee);
      else next.player = trainee;
      events.push({ type: "recruited", playerId: trainee.id });
      if (action.selectRecruited) events.push({ type: "player-selected", playerId: trainee.id });
      if (selected) events.push({ type: "selected-recruited", playerId: trainee.id, id: action.direction, credits: selectedRecruitmentPrice });
      break;
    }
    case "set-training-plan": {
      const trainee = action.scope === "roster" ? activePlayers(next).find((entry) => entry.id === action.playerId) : player2;
      if (!trainee || action.playerId !== trainee.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (!trainingPlans.some((plan) => plan.id === action.id)) return fail("\u8BAD\u7EC3\u8BA1\u5212\u4E0D\u5B58\u5728");
      if (trainee.training.planId === action.id) return fail("\u5F53\u524D\u5DF2\u4F7F\u7528\u8BE5\u8BAD\u7EC3\u8BA1\u5212");
      trainee.training.planId = action.id;
      trainee.training.shots = 0;
      trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      events.push({ type: "training-plan-changed", playerId: trainee.id, id: action.id });
      break;
    }
    case "accept-cooperation": {
      const trainee = action.scope === "roster" ? activePlayers(next).find((entry) => entry.id === action.playerId) : player2;
      if (!trainee || action.playerId !== trainee.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (!cooperationOffers(next, trainee).some((offer) => offer.id === action.id)) return fail("\u5408\u4F5C\u76EE\u6807\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (trainee.cooperation?.id === action.id) return fail("\u8BE5\u5408\u4F5C\u5DF2\u5728\u8FDB\u884C");
      if (trainee.level >= playerLevelCap) return fail(`\u7403\u5458\u5DF2\u8FBE\u5230 ${playerLevelCap} \u7EA7\u8BAD\u7EC3\u4E0A\u9650\uFF0C\u65E0\u6CD5\u65B0\u63A5\u6216\u66F4\u6362\u5408\u4F5C`);
      trainee.cooperation = { id: action.id, playerId: trainee.id, acceptedShots: trainee.shots, acceptedCourses: trainee.training.completedCourses, acceptedRevision: original.revision + 1 };
      trainee.equipmentTraining.cooperationCourses = [0, 0];
      trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      events.push({ type: "cooperation-accepted", playerId: trainee.id, id: action.id });
      break;
    }
    case "abandon-cooperation": {
      const trainee = action.scope === "roster" ? activePlayers(next).find((entry) => entry.id === action.playerId) : player2;
      if (!trainee || action.playerId !== trainee.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (!trainee.cooperation) return fail("\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u5408\u4F5C");
      trainee.cooperation = null;
      trainee.equipmentTraining.cooperationCourses = [0, 0];
      trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      events.push({ type: "cooperation-abandoned", playerId: trainee.id });
      break;
    }
    case "share-player-levels": {
      if (!player2 || action.playerId !== player2.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (!templateById(player2.templateId)) return fail("\u83B7\u5F97\u7403\u5458\u6A21\u677F\u540E\u624D\u80FD\u5206\u4EAB\u5347\u7EA7");
      if (player2.shareLevelClaimed) return fail("\u8BE5\u7403\u5458\u5DF2\u9886\u53D6\u5206\u4EAB\u5347\u7EA7\u5956\u52B1");
      if (player2.level >= playerLevelCap) return fail("\u7403\u5458\u5DF2\u8FBE\u5230 99 \u7EA7\u8BAD\u7EC3\u4E0A\u9650");
      const beforeStats = { ...player2.stats }, beforeTemplate = player2.templateId;
      const cooperationWasComplete = cooperationStatus(next, player2).complete;
      const targetLevel = Math.min(playerLevelCap, player2.level + 3);
      const experienceGain = experienceForLevel(targetLevel) - experienceForLevel(player2.level);
      const levelGain = addPlayerExperience(next, player2, experienceGain);
      player2.shareLevelClaimed = true;
      if (player2.level === playerLevelCap) player2.autoEnabled = false;
      const matched = match(player2);
      player2.templateId = matched.templateId;
      player2.lastStyle = matched.lastStyle;
      if (tierIds.indexOf(matched.tier) > tierIds.indexOf(player2.highestTier)) player2.highestTier = matched.tier;
      const changes = Object.fromEntries(statKeys.map((key) => [key, player2.stats[key] - beforeStats[key]]));
      events.push({ type: "player-share-rewarded", playerId: player2.id, changes, levelGain, experienceGain });
      if (beforeTemplate !== player2.templateId) events.push({ type: "template-changed", playerId: player2.id, templateId: player2.templateId ?? void 0 });
      rememberPlayer(next, events, player2);
      if (!cooperationWasComplete && cooperationStatus(next, player2).complete) events.push({ type: "cooperation-ready", playerId: player2.id, id: player2.cooperation.id });
      break;
    }
    case "restore-stamina-reward": {
      if (!player2 || action.playerId !== player2.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      const count = next.staminaRewardCount ?? 0;
      if (!Number.isSafeInteger(action.expectedCount) || action.expectedCount !== count) return fail("\u4F53\u529B\u5956\u52B1\u5DF2\u9886\u53D6\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00");
      if (action.method !== staminaRewardMethod(next)) return fail("\u4F53\u529B\u5956\u52B1\u9886\u53D6\u65B9\u5F0F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
      if (player2.level >= playerLevelCap) return fail("\u7403\u5458\u5DF2\u8FBE\u5230 99 \u7EA7\u8BAD\u7EC3\u4E0A\u9650");
      if (player2.stamina >= staminaMax(next)) return fail("\u8BE5\u7403\u5458\u4F53\u529B\u5DF2\u6EE1");
      if (!Number.isSafeInteger(count + 1)) return fail("\u4F53\u529B\u5956\u52B1\u6B21\u6570\u5DF2\u8FBE\u5230\u4E0A\u9650");
      const restoredStamina = staminaMax(next) - player2.stamina;
      player2.stamina = staminaMax(next);
      player2.recoveryMs = 0;
      next.staminaRewardCount = count + 1;
      events.push({ type: "stamina-rewarded", playerId: player2.id, restoredStamina });
      break;
    }
    case "complete-cooperation-ad": {
      const trainee = action.scope === "roster" ? activePlayers(next).find((entry) => entry.id === action.playerId) : player2;
      if (!trainee || action.playerId !== trainee.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      const active = trainee.cooperation;
      if ((active?.id ?? null) !== action.expectedCooperationId || (active ? active.acceptedRevision ?? 0 : null) !== action.expectedCooperationRevision) return fail("\u5408\u4F5C\u76EE\u6807\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (!cooperationOffers(next, trainee).some((offer) => offer.id === action.id)) return fail("\u5408\u4F5C\u76EE\u6807\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      if (active?.id === action.id && cooperationStatus(next, trainee).complete) return fail("\u8BE5\u5408\u4F5C\u5DF2\u7ECF\u8FBE\u6210");
      if (active?.id !== action.id) {
        trainee.cooperation = {
          id: action.id,
          playerId: trainee.id,
          acceptedShots: trainee.shots,
          acceptedCourses: trainee.training.completedCourses,
          acceptedRevision: original.revision + 1,
          adCompleted: true
        };
        trainee.equipmentTraining.cooperationCourses = [0, 0];
        trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      } else active.adCompleted = true;
      events.push({ type: "cooperation-ad-completed", playerId: trainee.id, id: action.id });
      events.push({ type: "cooperation-ready", playerId: trainee.id, id: action.id });
      break;
    }
    case "buy-equipment": {
      const offer = equipmentOffer(next, action.id);
      if (offer.price === null) return fail(offer.reason ?? "\u5668\u6750\u6682\u4E0D\u53EF\u8D2D");
      if (next.credits < offer.price) return fail("\u8D5E\u52A9\u5238\u4E0D\u8DB3");
      if (action.destination === "warehouse" && action.replaceId !== void 0) return fail("\u5165\u5E93\u8D2D\u4E70\u4E0D\u4F1A\u66FF\u6362\u9986\u5185\u5668\u6750");
      if (action.destination !== "warehouse") {
        const invalidInstallation = installationError(next, action.id, action.replaceId);
        if (invalidInstallation) return fail(invalidInstallation);
      }
      next.credits -= offer.price;
      next.ownedEquipment.push(action.id);
      next.purchasePrices[action.id] = offer.price;
      next.collectedEquipment[action.id] ??= { firstAt: now };
      events.push({ type: "equipment-bought", id: action.id });
      if (action.destination !== "warehouse") {
        installEquipment(next, action.id, action.replaceId, events);
        reconcileRecovery(timed, next);
        for (const trainee of activePlayers(next)) rememberPlayer(next, events, trainee);
      }
      break;
    }
    case "equip": {
      if (!catalogById.has(action.id) || !next.ownedEquipment.includes(action.id)) return fail("\u8BF7\u5148\u83B7\u5F97\u8BE5\u5668\u6750");
      if (next.equippedEquipment.includes(action.id)) return fail("\u8BE5\u5668\u6750\u5DF2\u5728\u9986\u5185\u751F\u6548");
      const invalidInstallation = installationError(next, action.id, action.replaceId);
      if (invalidInstallation) return fail(invalidInstallation);
      installEquipment(next, action.id, action.replaceId, events);
      reconcileRecovery(timed, next);
      for (const trainee of activePlayers(next)) rememberPlayer(next, events, trainee);
      break;
    }
    case "unequip": {
      if (!next.equippedEquipment.includes(action.id)) return fail("\u8BE5\u5668\u6750\u5C1A\u672A\u542F\u7528");
      next.equippedEquipment = next.equippedEquipment.filter((id2) => id2 !== action.id);
      reconcileRecovery(timed, next);
      events.push({ type: "unequipped", id: action.id });
      break;
    }
    case "sell-equipment": {
      if (!catalogById.has(action.id) || !next.ownedEquipment.includes(action.id)) return fail("\u4ED3\u5E93\u4E2D\u5DF2\u6CA1\u6709\u8BE5\u5668\u6750");
      if (next.equippedEquipment.includes(action.id)) return fail("\u9986\u5185\u751F\u6548\u7684\u5668\u6750\u4E0D\u80FD\u76F4\u63A5\u51FA\u552E\uFF0C\u8BF7\u5148\u66FF\u6362\u5165\u4ED3\u5E93");
      const refund = equipmentSaleValue(next, action.id);
      if (!Number.isSafeInteger(next.credits + refund)) return fail("\u8D5E\u52A9\u5238\u5DF2\u8FBE\u5230\u6570\u503C\u4E0A\u9650");
      next.ownedEquipment = next.ownedEquipment.filter((id2) => id2 !== action.id);
      delete next.purchasePrices[action.id];
      next.credits += refund;
      events.push({ type: "equipment-sold", id: action.id, credits: refund });
      break;
    }
    case "buy-drink":
    case "buy-consumable": {
      const id2 = action.type === "buy-drink" ? "drink" : action.id;
      const item = consumableById.get(id2);
      if (!item) return fail("\u6D88\u8017\u54C1\u4E0D\u5B58\u5728");
      if (item.retired) return fail("\u8BE5\u6D88\u8017\u54C1\u5DF2\u505C\u6B62\u9500\u552E\uFF0C\u5DF2\u6709\u5E93\u5B58\u4ECD\u53EF\u4F7F\u7528");
      if (next.gymLevel < item.unlockLevel) return fail(`\u7403\u9986 ${item.unlockLevel} \u7EA7\u5F00\u653E${item.name}`);
      if (next.credits < item.price) return fail("\u8D5E\u52A9\u5238\u4E0D\u8DB3");
      if (!Number.isSafeInteger(consumableCount(next, id2) + 1)) return fail("\u6D88\u8017\u54C1\u5E93\u5B58\u5DF2\u8FBE\u5230\u4E0A\u9650");
      next.credits -= item.price;
      next.inventory[id2] = consumableCount(next, id2) + 1;
      events.push({ type: id2 === "drink" ? "drink-bought" : "consumable-bought", id: id2 });
      break;
    }
    case "use-drink":
    case "use-consumable": {
      const playerId = action.type === "use-drink" ? action.id : action.playerId;
      const id2 = action.type === "use-drink" ? "drink" : action.id;
      if (!player2 || playerId !== player2.id) return fail("\u5F53\u524D\u7403\u5458\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      const reason = consumableUseReason(next, id2);
      if (reason) return fail(reason);
      next.inventory[id2] = consumableCount(next, id2) - 1;
      if (id2 === "drink" || id2 === "brace") {
        player2.stamina = Math.min(staminaMax(next), id2 === "brace" ? staminaMax(next) : player2.stamina + drinkRecovery);
        if (player2.stamina === staminaMax(next)) player2.recoveryMs = 0;
      } else if (id2 === "timer") {
        const nextShotAt = player2.nextShotAt;
        for (let shot = 0; shot < 10 && player2.stamina >= 1 && player2.level < playerLevelCap; shot++) trainPlayer(next, player2, now, events);
        player2.nextShotAt = Math.max(nextShotAt, now + shotCooldownMs);
      } else if (id2 === "chalk") {
        player2.greatShotsRemaining = chalkTrainingShots;
        delete player2.greatShotReady;
      } else if (id2 === "supplement") {
        for (const trainee of activePlayers(next)) if (trainee.level < playerLevelCap) {
          trainee.stamina = Math.min(staminaMax(next), trainee.stamina + teamSupplyRecovery);
          if (trainee.stamina === staminaMax(next)) trainee.recoveryMs = 0;
        }
      }
      events.push({ type: id2 === "drink" ? "drink-used" : "consumable-used", id: id2, playerId: player2.id });
      break;
    }
    case "upgrade-project": {
      const project = projectById.get(action.id);
      const offer = projectOffer(next, action.id);
      if (!project || offer.price === null) return fail(offer.reason ?? "\u9879\u76EE\u6682\u4E0D\u53EF\u5347\u7EA7");
      if (next.credits < offer.price) return fail("\u8D5E\u52A9\u5238\u4E0D\u8DB3");
      next.credits -= offer.price;
      next.projects[project.id]++;
      reconcileRecovery(timed, next);
      events.push({ type: "project-upgraded", id: project.id });
      break;
    }
    case "upgrade-gym": {
      if (action.targetLevel !== void 0 && action.targetLevel !== next.gymLevel + 1) return fail("\u7403\u9986\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u6269\u5EFA");
      const offer = gymUpgrade(next);
      if (!offer.canUpgrade || !offer.level) return fail(offer.reason);
      next.credits -= offer.price;
      next.gymLevel = offer.level.level;
      events.push({ type: "gym-upgraded", id: String(next.gymLevel) });
      break;
    }
    default:
      return fail("\u672A\u77E5\u64CD\u4F5C");
  }
  next.revision = original.revision + 1;
  return { state: next, events };
}

// src/game/gym/offline.ts
var offlineWindowsMs = [30, 45, 60, 90, 120, 180].map((minutes) => minutes * 6e4);
var legacyOfflineWindowsMs = [30, 60, 120, 240, 480, 720].map((minutes) => minutes * 6e4);
function offlineLimitMs(state) {
  return state.gymLevel < 2 ? 0 : Math.min(240, (offlineWindowsMs[state.projects.offline] ?? offlineWindowsMs[0]) / 6e4 + equipmentEffects(state).offlineMinutes) * 6e4;
}
function settleOfflineGym(original, now, capMs = offlineLimitMs(original), collectEvents) {
  if (!Number.isSafeInteger(now) || now <= original.updatedAt || now < 0) return { state: finishEquipmentMigration(original) };
  const elapsedMs = now - original.updatedAt;
  const limit = original.gymLevel < 2 || !Number.isSafeInteger(capMs) || capMs < 0 ? 0 : Math.min(capMs, original.offlineRulesVersion === 1 ? legacyOfflineWindowsMs[5] : 240 * 6e4);
  const creditedMs = Math.min(elapsedMs, limit);
  const trainees = activePlayers(original).filter((player2) => player2.autoEnabled && player2.level < playerLevelCap);
  if (!creditedMs || !trainees.length) return { state: finishEquipmentMigration(advanceGym(original, now)) };
  let state = cloneData(original);
  const until = original.updatedAt + creditedMs;
  const recoveryMs = recoverySeconds(state) * 1e3;
  const matched = /* @__PURE__ */ new Set();
  for (; ; ) {
    let nextAt = Number.POSITIVE_INFINITY;
    for (const player2 of activePlayers(state)) {
      if (!player2.autoEnabled || player2.level >= playerLevelCap) continue;
      const staminaAt = player2.stamina >= 1 ? state.updatedAt : state.updatedAt + recoveryMs - player2.recoveryMs;
      nextAt = Math.min(nextAt, Math.max(state.updatedAt, player2.nextShotAt, staminaAt));
    }
    if (nextAt > until) break;
    state = advanceGym(state, nextAt);
    const due = activePlayers(state).filter((player2) => player2.autoEnabled && player2.level < playerLevelCap && player2.nextShotAt <= nextAt && player2.stamina >= 1).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const events = [];
    for (const player2 of due) {
      trainPlayer(state, player2, nextAt, events, matched.has(player2.id));
      matched.add(player2.id);
    }
    if (events.length) collectEvents?.(events);
  }
  state = advanceGym(state, now);
  if (elapsedMs > limit) for (const player2 of activePlayers(state)) {
    if (player2.autoEnabled) player2.nextShotAt = Math.max(player2.nextShotAt, now + automaticIntervalMs(state));
  }
  state.revision = original.revision + 1;
  state = finishEquipmentMigration(state);
  const players = trainees.map((before) => {
    const after = activePlayers(state).find((player2) => player2.id === before.id);
    return {
      id: before.id,
      name: before.name,
      shots: after.shots - before.shots,
      xpGained: experienceForLevel(after.level) + after.experience - experienceForLevel(before.level) - before.experience,
      levelBefore: before.level,
      levelAfter: after.level,
      staminaBefore: before.stamina,
      staminaAfter: after.stamina,
      templateBefore: before.templateId,
      templateAfter: after.templateId,
      courses: after.training.completedCourses - before.training.completedCourses
    };
  });
  const report = {
    reportId: `offline_${state.seed}_${state.createdAt}_${original.updatedAt}_${now}`,
    from: original.updatedAt,
    to: now,
    elapsedMs,
    creditedMs,
    capMs: limit,
    capped: elapsedMs > limit,
    totalShots: players.reduce((sum, player2) => sum + player2.shots, 0),
    totalExperience: players.reduce((sum, player2) => sum + player2.xpGained, 0),
    players
  };
  if (elapsedMs >= 5e3 && report.totalShots > 0 && (!state.offlineReward || state.offlineReward.dismissed)) {
    state.offlineReward = { report: cloneData(report), claimed: false, dismissed: false };
  }
  return { state, report };
}

// src/game/gym/save.ts
var gymSaveMaxCharacters = 2e7;
var templateIds = new Set(templateRules.map((template) => template.id));
var equipmentIds = new Set(equipmentCatalog.map((equipment2) => equipment2.id));
var equipmentById = new Map(equipmentCatalog.map((equipment2) => [equipment2.id, equipment2]));
var previousEquipmentIds = new Set(previousEquipmentCatalog.map((equipment2) => equipment2.id));
var legacyEquipmentIds = new Set(legacyEquipmentCatalog.map((equipment2) => equipment2.id));
var legacyEquipmentById = new Map(legacyEquipmentCatalog.map((equipment2) => [equipment2.id, equipment2]));
var tiers = new Set(templateRules.map((template) => template.tier));
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var integer2 = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
var finite = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
var text = (value) => typeof value === "string" && value.length > 0 && value.length <= 120;
var money = (value) => typeof value === "string" && value.length <= 2e4 && /^(0|[1-9]\d*)$/.test(value);
var has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function agreement(value, athlete) {
  return value === null || record(value) && text(value.id) && value.playerId === athlete.id && integer2(value.acceptedShots, 0, athlete.shots) && integer2(value.acceptedCourses, 0, record(athlete.training) ? athlete.training.completedCourses : 0) && (!has(value, "acceptedRevision") || integer2(value.acceptedRevision)) && (!has(value, "adCompleted") || typeof value.adCompleted === "boolean");
}
function stats2(value, min, max, whole = true) {
  return record(value) && statKeys.every((key) => whole ? integer2(value[key], min, max) : finite(value[key], min, max));
}
function training(value) {
  return record(value) && ["balanced", "shooting", "finishing", "interior"].includes(String(value.planId)) && integer2(value.shots, 0, 9) && integer2(value.completedCourses);
}
function equipmentTraining(value, athlete, allowMissingPartial) {
  if (!record(value) || !integer2(value.brandShots, 0, athlete.shots) || !integer2(value.brandTotal, 0, value.brandShots * 50) || !Array.isArray(value.cooperationCourses) || value.cooperationCourses.length !== 2) return false;
  const courses = record(athlete.training) ? athlete.training.completedCourses : 0;
  const accepted = record(athlete.cooperation) ? athlete.cooperation.acceptedCourses : courses;
  if (!integer2(value.cooperationCourses[0], 0, Math.min(2, courses - accepted)) || !integer2(value.cooperationCourses[1], 0, value.cooperationCourses[0])) return false;
  if (!has(value, "cooperationCourseShots")) return allowMissingPartial;
  const currentCourse = record(athlete.cooperation) && record(athlete.training) ? athlete.training.shots : 0;
  return Array.isArray(value.cooperationCourseShots) && value.cooperationCourseShots.length === 2 && integer2(value.cooperationCourseShots[0], 0, currentCourse) && integer2(value.cooperationCourseShots[1], 0, value.cooperationCourseShots[0]);
}
function player(value, updatedAt, gymLevel, legacy, balanceVersion, equipmentMetadataRequired, allowMissingPartial) {
  if (!record(value) || !text(value.id) || !text(value.name) || !integer2(value.enteredAt, 0, updatedAt) || !integer2(value.height, 178, 218) || !integer2(value.level, 0, 99) || !integer2(value.peakLevel, value.level, 99) || !integer2(value.matchSeed, 0, 4294967295) || !integer2(value.shots) || !integer2(value.stamina, 0, 90) || !integer2(value.recoveryMs, 0, 19999) || !stats2(value.stats, 0, 99) || !stats2(value.entryStats, 24, 54) || !stats2(value.bias, 0, 1, false) || !stats2(value.lastStyle, -3, 3, false)) return false;
  const currentStats = value.stats;
  const entryStats = value.entryStats;
  if (!statKeys.every((key) => currentStats[key] >= entryStats[key])) return false;
  const level = value.level;
  const requirement = balanceVersion === 1 ? 20 + 6 * level + level * level : requiredExperience(level);
  if ((!legacy || has(value, "experience")) && !integer2(value.experience, 0, level === 99 ? 0 : requirement - 1)) return false;
  if ((!legacy || has(value, "nextShotAt")) && !integer2(value.nextShotAt)) return false;
  if ((!legacy || has(value, "autoEnabled")) && (typeof value.autoEnabled !== "boolean" || gymLevel < 2 && value.autoEnabled)) return false;
  if (has(value, "greatShotReady") && typeof value.greatShotReady !== "boolean") return false;
  if (has(value, "greatShotsRemaining") && !integer2(value.greatShotsRemaining, 1, maximumStoredChalkShots)) return false;
  if (has(value, "shareLevelClaimed") && typeof value.shareLevelClaimed !== "boolean") return false;
  if (has(value, "overflowExperience") && !integer2(value.overflowExperience)) return false;
  if ((!legacy || has(value, "cooperation")) && !agreement(value.cooperation, value)) return false;
  if ((!legacy || Object.prototype.hasOwnProperty.call(value, "enteredGymLevel")) && !integer2(value.enteredGymLevel, 1, gymLevel)) return false;
  if (!legacy || Object.prototype.hasOwnProperty.call(value, "training")) {
    if (!training(value.training) || !record(value.training)) return false;
    if (value.training.completedCourses > Math.floor(value.shots / 10) || value.training.completedCourses * 10 + value.training.shots > value.shots) return false;
  }
  if ((equipmentMetadataRequired || has(value, "equipmentTraining")) && !equipmentTraining(value.equipmentTraining, value, allowMissingPartial)) return false;
  if (value.templateId !== null && (typeof value.templateId !== "string" || !templateIds.has(value.templateId))) return false;
  if (value.highestTier !== null && !tiers.has(value.highestTier)) return false;
  if (!record(value.book)) return false;
  const book = value.book;
  return ["base", "greatBank", "flat", "permanent"].every((key) => {
    const fraction2 = book[key];
    return record(fraction2) && money(fraction2.n) && money(fraction2.d) && fraction2.d !== "0";
  });
}
function idList(value, allowed) {
  return Array.isArray(value) && value.length <= allowed.size && new Set(value).size === value.length && value.every((id2) => typeof id2 === "string" && allowed.has(id2));
}
function validGymAlumnus(value, state) {
  if (!record(value)) return false;
  const fields = value;
  return player(value, state.updatedAt, state.gymLevel, false, 3, true, false) && integer2(fields.recommendedAt, value.enteredAt, state.updatedAt) && integer2(fields.rewardCredits, 0, maximumRecommendationCredits) && integer2(fields.rewardFame) && money(fields.finalValue);
}
function legacyEffects(state) {
  const effects = {
    stamina: 0,
    recovery: 0,
    valuePercent: 0,
    focus: Object.fromEntries(statKeys.map((key) => [key, 0])),
    courseRecovery: 0,
    cooperationBonus: 0,
    experience: 0,
    automationExperience: 0,
    offlineMinutes: 0
  };
  for (const id2 of state.equippedEquipment) if (state.ownedEquipment.includes(id2)) {
    const item = legacyEquipmentById.get(id2);
    effects.stamina += item.effects.stamina;
    effects.recovery += item.effects.recovery;
    effects.valuePercent += item.effects.valuePercent;
    effects.courseRecovery += item.effects.courseRecovery;
    effects.cooperationBonus += item.effects.cooperationBonus;
    if (item.effects.focusKey) effects.focus[item.effects.focusKey] += item.effects.focusPower;
  }
  effects.stamina = Math.min(20, effects.stamina);
  effects.recovery = Math.min(4, effects.recovery);
  effects.courseRecovery = Math.min([1, 2, 2, 3, 3, 4, 4, 4][state.gymLevel - 1], effects.courseRecovery);
  effects.cooperationBonus = Math.min(2, effects.cooperationBonus);
  for (const key of statKeys) effects.focus[key] = Math.min(1.5, effects.focus[key]);
  return effects;
}
function validPendingEffects(value, gymLevel) {
  return record(value) && integer2(value.stamina, 0, 20) && integer2(value.recovery, 0, 4) && integer2(value.valuePercent, 0, 280) && stats2(value.focus, 0, 1.5, false) && integer2(value.courseRecovery, 0, [1, 2, 2, 3, 3, 4, 4, 4][gymLevel - 1]) && integer2(value.cooperationBonus, 0, 2) && value.experience === 0 && value.automationExperience === 0 && value.offlineMinutes === 0;
}
function validGymShape(value, legacy = false) {
  if (record(value) && has(value, "offlineReward")) {
    const reward = value.offlineReward;
    if (!record(reward) || typeof reward.claimed !== "boolean" || typeof reward.dismissed !== "boolean" || !record(reward.report)) return false;
    const r = reward.report;
    if (!text(r.reportId) || ![r.from, r.to, r.elapsedMs, r.creditedMs, r.capMs, r.totalShots, r.totalExperience].every((v) => integer2(v)) || r.to > value.updatedAt || r.elapsedMs !== r.to - r.from || r.creditedMs > r.elapsedMs || typeof r.capped !== "boolean" || !Array.isArray(r.players) || r.players.length > 8 || new Set(r.players.map((p) => record(p) ? p.id : null)).size !== r.players.length) return false;
    let xp = 0, shots = 0;
    for (const p of r.players) {
      if (!record(p) || !text(p.id) || !text(p.name) || ![p.shots, p.xpGained, p.courses, p.staminaBefore, p.staminaAfter].every((v) => integer2(v)) || !integer2(p.levelBefore, 0, 99) || !integer2(p.levelAfter, p.levelBefore, 99) || !(p.templateBefore === null || typeof p.templateBefore === "string" && templateIds.has(p.templateBefore)) || !(p.templateAfter === null || typeof p.templateAfter === "string" && templateIds.has(p.templateAfter))) return false;
      xp += p.xpGained;
      shots += p.shots;
    }
    if (xp !== r.totalExperience || shots !== r.totalShots) return false;
    if (has(r, "bonusExperience")) {
      if (!record(r.bonusExperience) || Object.keys(r.bonusExperience).length !== r.players.length) return false;
      for (const p of r.players) {
        if (!has(r.bonusExperience, p.id) || !integer2(r.bonusExperience[p.id], 0, p.xpGained)) return false;
      }
    }
  }
  if (record(value) && has(value, "staminaRewardCount") && !integer2(value.staminaRewardCount)) return false;
  if (record(value) && has(value, "recommendationRulesVersion") && value.recommendationRulesVersion !== 11) return false;
  if (record(value) && value.recommendationRulesVersion === 11 && !idList(value.postgameRecommendedTemplates, templateIds)) return false;
  if (record(value) && has(value, "postgameRecommendedTemplates") && !idList(value.postgameRecommendedTemplates, templateIds)) return false;
  if (record(value) && has(value, "collectionGoalId") && value.collectionGoalId !== null && (typeof value.collectionGoalId !== "string" || !templateIds.has(value.collectionGoalId))) return false;
  if (record(value) && has(value, "alumniArchive")) {
    const archive = value.alumniArchive;
    if (!record(archive) || !text(archive.id) || !/^[a-zA-Z0-9_-]+$/.test(archive.id) || !integer2(archive.count, 1) || !integer2(archive.effectiveCount, 0, archive.count) || !integer2(archive.legendCount, 0, archive.effectiveCount) || !integer2(archive.bestTier, 0, 5) || (archive.effectiveCount === 0 ? archive.bestTier !== 0 : archive.bestTier < 1) || archive.legendCount > 0 !== (archive.bestTier === 5)) return false;
  }
  if (record(value) && has(value, "offlineRulesVersion") && value.offlineRulesVersion !== 1 && value.offlineRulesVersion !== 2) return false;
  if (record(value) && (legacy ? has(value, "equipmentCatalogVersion") && ![1, 2, 3].includes(value.equipmentCatalogVersion) : value.equipmentCatalogVersion !== equipmentCatalogVersion)) return false;
  const legacyCatalog = legacy && record(value) && value.equipmentCatalogVersion !== equipmentCatalogVersion;
  const allowedEquipment = legacyCatalog ? record(value) && value.equipmentCatalogVersion === 2 ? previousEquipmentIds : legacyEquipmentIds : equipmentIds;
  if (!record(value) || value.kind !== "gym-management" || value.version !== 1 || !integer2(value.seed, 0, 4294967295) || !integer2(value.revision) || !integer2(value.updatedAt) || !integer2(value.createdAt, 0, value.updatedAt) || !integer2(value.nextPlayer, 1) || !integer2(value.credits) || !integer2(value.fame) || !integer2(value.gymLevel, 1, 8) || !record(value.projects) || !record(value.inventory) || !integer2(value.inventory.drink) || !idList(value.ownedEquipment, allowedEquipment) || !idList(value.equippedEquipment, allowedEquipment)) return false;
  if (!allGymConsumables.every((item) => !has(value.inventory, item.id) || integer2(value.inventory[item.id]))) return false;
  const owned = value.ownedEquipment;
  if (!legacy || has(value, "purchasePrices")) {
    if (!record(value.purchasePrices) || Object.keys(value.purchasePrices).length !== owned.length || !Object.entries(value.purchasePrices).every(([id2, cost]) => owned.includes(id2) && integer2(cost, 1))) return false;
  }
  if (legacy ? has(value, "balanceVersion") && ![1, 2, 3].includes(value.balanceVersion) : value.balanceVersion !== 3) return false;
  const balanceVersion = value.balanceVersion === 3 ? 3 : value.balanceVersion === 2 ? 2 : 1;
  if (balanceVersion >= 2 && !has(value, "bench")) return false;
  const projectLevels = value.projects;
  if (Object.keys(projectLevels).length !== projects.length || !projects.every((project) => {
    const limit = Math.min(project.maxLevel, Math.max(0, value.gymLevel - project.unlockLevel + 1));
    return integer2(projectLevels[project.id], 0, limit);
  })) return false;
  if (value.equippedEquipment.length > 4 + value.projects.equipment || !value.equippedEquipment.every((id2) => owned.includes(id2))) return false;
  if (!legacyCatalog && new Set(value.equippedEquipment.map((id2) => equipmentById.get(id2).family)).size !== value.equippedEquipment.length) return false;
  if (has(value, "pendingLegacyEquipmentEffects") && (legacyCatalog || !validPendingEffects(value.pendingLegacyEquipmentEffects, value.gymLevel))) return false;
  if (!record(value.rng)) return false;
  const rng = value.rng;
  if (!["recruits", "economy", "attributes"].every((key) => record(rng[key]) && integer2(rng[key].state, 0, 4294967295))) return false;
  if (!record(value.collection) || !Object.entries(value.collection).every(([id2, entry]) => templateIds.has(id2) && record(entry) && integer2(entry.firstAt, 0, value.updatedAt) && finite(entry.highestRating, 0, 99) && money(entry.highestValue))) return false;
  if (!record(value.collectedEquipment) || !Object.entries(value.collectedEquipment).every(([id2, entry]) => allowedEquipment.has(id2) && record(entry) && integer2(entry.firstAt, 0, value.updatedAt))) return false;
  const collectedEquipment = value.collectedEquipment;
  if (!owned.every((id2) => Object.prototype.hasOwnProperty.call(collectedEquipment, id2))) return false;
  if (has(value, "legacyEquipmentCollection") && (!record(value.legacyEquipmentCollection) || !Object.entries(value.legacyEquipmentCollection).every(([id2, entry]) => legacyEquipmentIds.has(id2) && record(entry) && integer2(entry.firstAt, 0, value.updatedAt)))) return false;
  const oldFormat = legacy && !has(value, "bench");
  if (!oldFormat && (has(value, "nextShotAt") || has(value, "cooperation"))) return false;
  if (has(value, "nextShotAt") && !integer2(value.nextShotAt)) return false;
  if (!oldFormat && (!Array.isArray(value.bench) || value.bench.length > value.gymLevel - (value.player ? 1 : 0))) return false;
  const bench = Array.isArray(value.bench) ? value.bench : [];
  if (value.player === null && bench.length) return false;
  if (value.player !== null && !player(value.player, value.updatedAt, value.gymLevel, oldFormat, balanceVersion, !legacyCatalog, legacy)) return false;
  if (bench.some((athlete) => !player(athlete, value.updatedAt, value.gymLevel, false, balanceVersion, !legacyCatalog, legacy))) return false;
  if (has(value, "cooperation") && (!record(value.player) ? value.cooperation !== null : !agreement(value.cooperation, value.player))) return false;
  if (!Array.isArray(value.alumni) || value.alumni.length > 1e5) return false;
  const activePlayers2 = [...value.player ? [value.player] : [], ...bench];
  const maximumStamina = legacyCatalog ? 20 + value.projects.endurance * 5 + legacyEffects(value).stamina : staminaMax(value);
  if (balanceVersion === 3 && activePlayers2.some((athlete) => athlete.stamina > maximumStamina)) return false;
  const playerIds = new Set(activePlayers2.map((athlete) => athlete.id));
  if (playerIds.size !== activePlayers2.length) return false;
  for (const alumnus of value.alumni) {
    if (!record(alumnus)) return false;
    const fields = alumnus;
    if (!player(alumnus, value.updatedAt, value.gymLevel, oldFormat, balanceVersion, !legacyCatalog, legacy) || playerIds.has(alumnus.id) || !integer2(fields.recommendedAt, alumnus.enteredAt, value.updatedAt) || !integer2(fields.rewardCredits, 0, maximumRecommendationCredits) || !integer2(fields.rewardFame) || !money(fields.finalValue)) return false;
    playerIds.add(alumnus.id);
  }
  return true;
}
function validGym(value) {
  if (!validGymShape(value)) return false;
  return [...value.player ? [value.player] : [], ...value.bench].every((athlete) => athlete.cooperation === null || buildCooperationOffers(value, athlete).some((offer) => offer.id === athlete.cooperation.id));
}
function migrateEquipment(state) {
  if (state.equipmentCatalogVersion === equipmentCatalogVersion) return true;
  const oldEffects = legacyEffects(state);
  const oldCatalogVersion = state.equipmentCatalogVersion;
  const installed = new Set(state.equippedEquipment);
  const groups = /* @__PURE__ */ new Map();
  for (const id2 of state.ownedEquipment) {
    const canonical2 = oldCatalogVersion === 2 ? id2 : equipmentCanonicalIds.get(id2);
    const items = groups.get(canonical2) ?? [];
    items.push(id2);
    groups.set(canonical2, items);
  }
  const owned = [];
  const purchasePrices = {};
  let refund = 0;
  for (const [canonical2, items] of groups) {
    const ordered = [...items].sort((a, b) => Number(installed.has(b)) - Number(installed.has(a)) || Number(b === canonical2) - Number(a === canonical2) || a.localeCompare(b));
    if (equipmentIds.has(canonical2)) {
      owned.push(canonical2);
      const previousCost = state.purchasePrices[ordered[0]];
      const retainedCost = Math.min(previousCost, equipmentById.get(canonical2).price);
      purchasePrices[canonical2] = retainedCost;
      refund += previousCost - retainedCost;
      if (!Number.isSafeInteger(refund)) return false;
    }
    for (const id2 of equipmentIds.has(canonical2) ? ordered.slice(1) : ordered) {
      refund += state.purchasePrices[id2];
      if (!Number.isSafeInteger(refund)) return false;
    }
  }
  if (!Number.isSafeInteger(state.credits + refund)) return false;
  const collectedEquipment = {};
  const legacyEquipmentCollection = { ...state.legacyEquipmentCollection };
  for (const [id2, entry] of Object.entries(state.collectedEquipment)) {
    const archived = legacyEquipmentCollection[id2];
    legacyEquipmentCollection[id2] = { firstAt: Math.min(archived?.firstAt ?? entry.firstAt, entry.firstAt) };
    const canonical2 = oldCatalogVersion === 2 ? id2 : equipmentCanonicalIds.get(id2);
    if (!equipmentIds.has(canonical2)) continue;
    const previous = collectedEquipment[canonical2];
    collectedEquipment[canonical2] = { firstAt: Math.min(previous?.firstAt ?? entry.firstAt, entry.firstAt) };
  }
  state.credits += refund;
  state.ownedEquipment = owned;
  const mappedInstalled = [...new Set(state.equippedEquipment.map((id2) => oldCatalogVersion === 2 ? id2 : equipmentCanonicalIds.get(id2)))].filter((id2) => equipmentIds.has(id2));
  const bestByFamily = /* @__PURE__ */ new Map();
  for (const id2 of mappedInstalled) {
    const item = equipmentById.get(id2);
    const previous = bestByFamily.get(item.family);
    if (!previous || item.grade > equipmentById.get(previous).grade) bestByFamily.set(item.family, id2);
  }
  state.equippedEquipment = mappedInstalled.filter((id2) => bestByFamily.get(equipmentById.get(id2).family) === id2);
  state.purchasePrices = purchasePrices;
  state.collectedEquipment = collectedEquipment;
  state.legacyEquipmentCollection = legacyEquipmentCollection;
  state.equipmentCatalogVersion = equipmentCatalogVersion;
  state.pendingLegacyEquipmentEffects = oldEffects;
  for (const athlete of [...state.alumni, ...state.player ? [state.player] : [], ...state.bench]) {
    const brandTotal = Math.min(50, oldEffects.valuePercent) * athlete.shots;
    if (!Number.isSafeInteger(brandTotal)) return false;
    athlete.equipmentTraining = { brandTotal, brandShots: athlete.shots, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0] };
  }
  return true;
}
function restoreGym(value) {
  const sourceBalanceVersion = record(value) ? value.balanceVersion : void 0;
  if (!validGymShape(value, true)) return null;
  const oldFormat = !has(value, "bench");
  const oldBalance = sourceBalanceVersion !== 2 && sourceBalanceVersion !== 3;
  const oldStamina = sourceBalanceVersion !== 3;
  if (oldFormat) value.bench = [];
  if (!has(value, "purchasePrices")) value.purchasePrices = Object.fromEntries(value.ownedEquipment.map((id2) => [id2, legacyEquipmentPurchasePrice(id2)]));
  if (!migrateEquipment(value)) return null;
  for (const athlete of [...value.alumni, ...value.player ? [value.player] : [], ...value.bench]) {
    if (!has(athlete.equipmentTraining, "cooperationCourseShots")) athlete.equipmentTraining.cooperationCourseShots = [0, 0];
    if (!Object.prototype.hasOwnProperty.call(athlete, "training")) athlete.training = { planId: "balanced", shots: 0, completedCourses: 0 };
    if (!Object.prototype.hasOwnProperty.call(athlete, "enteredGymLevel")) athlete.enteredGymLevel = value.gymLevel;
    if (oldFormat) {
      if (!has(athlete, "experience")) athlete.experience = 0;
      if (!has(athlete, "nextShotAt")) athlete.nextShotAt = athlete === value.player ? value.nextShotAt ?? value.updatedAt : value.updatedAt;
      if (!has(athlete, "autoEnabled")) athlete.autoEnabled = false;
      if (!has(athlete, "cooperation")) athlete.cooperation = athlete === value.player ? value.cooperation ?? null : null;
    }
    if (oldBalance) {
      const oldRequirement = 20 + 6 * athlete.level + athlete.level * athlete.level;
      athlete.experience = athlete.level === 99 ? 0 : Math.floor(athlete.experience * requiredExperience(athlete.level) / oldRequirement);
    }
  }
  if (oldStamina) for (const athlete of [...value.player ? [value.player] : [], ...value.bench]) {
    athlete.stamina = Math.min(athlete.stamina, staminaMax(value));
    if (athlete.stamina === staminaMax(value)) athlete.recoveryMs = 0;
  }
  value.balanceVersion = 3;
  delete value.cooperation;
  delete value.nextShotAt;
  return validGym(value) ? value : null;
}
function decodeGym(raw) {
  try {
    if (!raw || raw.length > gymSaveMaxCharacters) return null;
    const envelope = JSON.parse(raw);
    if (envelope?.format !== "gym-management-envelope-v1" || typeof envelope.payload !== "string" || hash(envelope.payload) !== envelope.checksum) return null;
    const state = JSON.parse(envelope.payload);
    return restoreGym(state);
  } catch {
    return null;
  }
}

// src/platform/hupuProject.ts
var hupuProject = Object.freeze({ applicationId: activity_default.activityId, name: activity_default.activityName });

// src/platform/gymCloudArchive.ts
var failure = "\u8FD9\u4E0D\u662F\u6709\u6548\u7684\u4F20\u5947\u7403\u9986\u4E91\u5B58\u6863\uFF0C\u672C\u5730\u8FDB\u5EA6\u5DF2\u4FDD\u7559";
var pick = (source, keys) => Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
function portablePlayer(player2) {
  const value = pick(player2, ["id", "name", "enteredAt", "height", "matchSeed", "level", "peakLevel", "templateId", "highestTier", "shots", "stamina", "recoveryMs", "enteredGymLevel", "experience", "nextShotAt", "autoEnabled", "greatShotReady", "greatShotsRemaining", "shareLevelClaimed"]);
  for (const key of ["stats", "entryStats", "bias", "lastStyle"]) value[key] = pick(player2[key], statKeys);
  value.book = Object.fromEntries(Object.entries(player2.book).filter(([key]) => ["base", "greatBank", "flat", "permanent"].includes(key)).map(([key, fraction2]) => [key, { n: fraction2.n, d: fraction2.d }]));
  value.training = { planId: player2.training.planId, shots: player2.training.shots, completedCourses: player2.training.completedCourses };
  value.equipmentTraining = { brandTotal: player2.equipmentTraining.brandTotal, brandShots: player2.equipmentTraining.brandShots, cooperationCourses: [...player2.equipmentTraining.cooperationCourses], cooperationCourseShots: [...player2.equipmentTraining.cooperationCourseShots] };
  value.cooperation = player2.cooperation ? pick(player2.cooperation, ["id", "playerId", "acceptedShots", "acceptedCourses", "acceptedRevision", "adCompleted"]) : null;
  return value;
}
function portableGym(source) {
  const value = pick(source, ["kind", "version", "balanceVersion", "seed", "revision", "createdAt", "updatedAt", "nextPlayer", "credits", "fame", "gymLevel", "equipmentCatalogVersion", "offlineRulesVersion", "collectionGoalId", "recommendationRulesVersion", "staminaRewardCount"]);
  value.player = source.player ? portablePlayer(source.player) : null;
  value.bench = source.bench.map(portablePlayer);
  value.alumni = source.alumni.map((player2) => ({ ...portablePlayer(player2), recommendedAt: player2.recommendedAt, rewardCredits: player2.rewardCredits, rewardFame: player2.rewardFame, finalValue: player2.finalValue }));
  value.projects = pick(source.projects, ["endurance", "recovery", "recruitment", "equipment", "automation", "offline"]);
  value.inventory = pick(source.inventory, ["drink", "brace", "timer", "chalk", "supplement"]);
  value.ownedEquipment = [...source.ownedEquipment];
  value.equippedEquipment = [...source.equippedEquipment];
  value.purchasePrices = pick(source.purchasePrices, source.ownedEquipment);
  value.collection = Object.fromEntries(Object.entries(source.collection).map(([id2, item]) => [id2, { firstAt: item.firstAt, highestRating: item.highestRating, highestValue: item.highestValue }]));
  value.collectedEquipment = Object.fromEntries(Object.entries(source.collectedEquipment).map(([id2, item]) => [id2, { firstAt: item.firstAt }]));
  if (source.legacyEquipmentCollection) value.legacyEquipmentCollection = Object.fromEntries(Object.entries(source.legacyEquipmentCollection).map(([id2, item]) => [id2, { firstAt: item.firstAt }]));
  if (source.postgameRecommendedTemplates) value.postgameRecommendedTemplates = [...source.postgameRecommendedTemplates];
  value.rng = { recruits: { state: source.rng.recruits.state }, economy: { state: source.rng.economy.state }, attributes: { state: source.rng.attributes.state } };
  if (source.pendingLegacyEquipmentEffects) value.pendingLegacyEquipmentEffects = { ...pick(source.pendingLegacyEquipmentEffects, ["stamina", "recovery", "valuePercent", "courseRecovery", "cooperationBonus", "experience", "automationExperience", "offlineMinutes"]), focus: pick(source.pendingLegacyEquipmentEffects.focus, statKeys) };
  return value;
}
function parseGymCloudArchive(raw) {
  try {
    if (new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024) throw Error();
    const archive = JSON.parse(raw);
    if (archive?.format !== "legend-gym-cloud-v1" || archive.applicationId !== hupuProject.applicationId || !Number.isSafeInteger(archive.uploadedAt) || archive.uploadedAt < 0 || typeof archive.gym !== "string") throw Error();
    const state = decodeGym(archive.gym);
    if (!state || state.alumniArchive?.count) throw Error();
    const portable = portableGym(state);
    if (!validGym(portable)) throw Error();
    return { archive, state: portable };
  } catch {
    throw Error(failure);
  }
}

// server/gymAuthorityService.ts
import { extractGymClockInterval, extractGymRecoveryClockInterval } from "./gymTimeflowClock.mjs";

// server/gymAuthorityRepository.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
var copy = (value) => structuredClone(value);
var bindingQueues = /* @__PURE__ */ new Map();
async function bindExclusive(directory, work) {
  const prior = bindingQueues.get(directory) ?? Promise.resolve();
  const next = prior.catch(() => {
  }).then(work);
  bindingQueues.set(directory, next);
  try {
    return await next;
  } finally {
    if (bindingQueues.get(directory) === next) bindingQueues.delete(directory);
  }
}
var authorityFailure = (code, statusCode = 503, retryable = false, message = code) => Object.assign(new Error(message), { code, statusCode, retryable });
function compact(document) {
  const next = copy(document), state = next.state;
  if (!state) return { document: next, additions: [], firstSequence: 0 };
  const overflow = Math.max(0, state.alumni.length - 100);
  const archive = state.alumniArchive;
  const firstSequence = archive?.count ?? 0;
  if (!overflow) return { document: next, additions: [], firstSequence };
  const metadata = { ...archive ?? { id: next.epoch, count: 0, effectiveCount: 0, legendCount: 0, bestTier: 0 } };
  const additions = state.alumni.slice(0, overflow);
  for (const player2 of additions) {
    const earned = recommendation(player2);
    if (earned.growth > 0 && earned.tier >= 1) {
      metadata.effectiveCount++;
      if (earned.tier === 5) metadata.legendCount++;
      metadata.bestTier = Math.max(metadata.bestTier, earned.tier);
    }
  }
  metadata.count += overflow;
  state.alumniArchive = metadata;
  state.alumni = state.alumni.slice(overflow);
  return { document: next, additions, firstSequence };
}
function page(document, cold, offset, limit) {
  const state = document?.state;
  if (!state) return { players: [], total: 0 };
  const total = state.alumni.length + (state.alumniArchive?.count ?? 0);
  if (cold.length !== (state.alumniArchive?.count ?? 0)) throw authorityFailure("HISTORY_INCOMPLETE");
  const newest = [...state.alumni].reverse();
  const players = [];
  for (let index = offset; index < Math.min(total, offset + limit); index++) players.push(copy(index < newest.length ? newest[index] : cold[cold.length - 1 - (index - newest.length)]));
  return { players, total };
}
function createFileGymAuthorityRepository(directory) {
  const root = resolve(directory), queues = /* @__PURE__ */ new Map();
  return { kind: "file-development", async withActor(key, work) {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {
    }).then(async () => {
      await mkdir(root, { recursive: true, mode: 448 });
      const file = resolve(root, createHash("sha256").update(key).digest("hex") + ".json");
      let record2 = { document: null, cold: [] };
      try {
        record2 = JSON.parse(await readFile(file, "utf8"));
        if (!record2 || !Array.isArray(record2.cold) || !("document" in record2)) throw Error("invalid repository");
      } catch (error) {
        if (error.code !== "ENOENT") throw authorityFailure("REPOSITORY_INVALID");
      }
      const tx = { document: copy(record2.document), async commit(document) {
        return bindExclusive(root, async () => {
          if (!record2.document) {
            for (const name of await readdir(root)) {
              if (!name.endsWith(".json") || resolve(root, name) === file) continue;
              const other = JSON.parse(await readFile(resolve(root, name), "utf8")).document;
              if (other && (other.epoch === document.epoch || other.workspaceId === document.workspaceId && other.scopeType === document.scopeType && other.scopeId === document.scopeId)) throw authorityFailure("SCOPE_BINDING_CONFLICT", 409, false, "\u7403\u9986\u65F6\u95F4\u4F5C\u7528\u57DF\u5DF2\u7ED1\u5B9A\uFF0C\u672A\u590D\u7528\u5176\u4ED6\u73A9\u5BB6\u8FDB\u5EA6");
            }
          }
          const prepared = compact(document);
          const sameEpoch = record2.document?.epoch === document.epoch;
          const cold = sameEpoch ? [...record2.cold] : [];
          if (cold.length !== prepared.firstSequence) throw authorityFailure("HISTORY_CONFLICT");
          cold.push(...prepared.additions);
          const future = { document: prepared.document, cold };
          const temporary = file + "." + randomUUID() + ".tmp";
          let handle;
          try {
            handle = await open(temporary, "wx", 384);
            await handle.writeFile(JSON.stringify(future));
            await handle.sync();
            await handle.close();
            handle = void 0;
            await rename(temporary, file);
          } catch {
            await handle?.close().catch(() => {
            });
            await unlink(temporary).catch(() => {
            });
            throw authorityFailure("SAVE_FAILED");
          }
          record2 = future;
          tx.document = copy(prepared.document);
          return copy(prepared.document);
        });
      }, async alumni(offset, limit) {
        return page(tx.document, record2.cold, offset, limit);
      } };
      return work(tx);
    });
    queues.set(key, next);
    try {
      return await next;
    } finally {
      if (queues.get(key) === next) queues.delete(key);
    }
  } };
}
function createCloudBaseGymAuthorityRepository(rpc, options = {}) {
  const leaseMs = options.leaseMs ?? 12e4;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 3e4 || leaseMs > 18e4) throw Error("Invalid repository lease");
  return { kind: "cloudbase", async withActor(key, work) {
    const owner = randomUUID();
    const claim = await rpc("gym_authority_claim", { p_actor_key: key, p_owner: owner, p_lease_ms: leaseMs });
    if (!claim || !Number.isSafeInteger(claim.version) || !Number.isSafeInteger(claim.fence)) throw authorityFailure("REPOSITORY_UNAVAILABLE");
    let version = claim.version;
    const tx = { document: copy(claim.document), async commit(document) {
      const prepared = compact(document);
      const saved = await rpc("gym_authority_commit", { p_actor_key: key, p_owner: owner, p_fence: claim.fence, p_expected_version: version, p_document: prepared.document, p_alumni: prepared.additions, p_first_sequence: prepared.firstSequence });
      if (!saved || saved.version !== version + 1) throw authorityFailure("REVISION_CONFLICT", 409, true);
      version = saved.version;
      tx.document = copy(prepared.document);
      return copy(prepared.document);
    }, async alumni(offset, limit) {
      const result = await rpc("gym_authority_alumni", { p_actor_key: key, p_epoch: tx.document?.epoch, p_offset: offset, p_limit: limit });
      if (!result || !Array.isArray(result.players) || !Number.isSafeInteger(result.total)) throw authorityFailure("HISTORY_INCOMPLETE");
      return result;
    } };
    try {
      return await work(tx);
    } finally {
      await rpc("gym_authority_release", { p_actor_key: key, p_owner: owner, p_fence: claim.fence }).catch(() => {
      });
    }
  } };
}

// server/gymRankProgress.ts
function verifiedGymRankingProgress({ binding, evidenceId, state, alumni = state.alumni, previousBest = null }) {
  if (typeof window !== "undefined") throw Error("Verified ranking progress is server-only");
  if (binding.applicationId !== activity_default.activityId || !binding.actor || binding.runId !== `${state.createdAt}-${state.seed}` || !/^[A-Za-z0-9_:-]{1,128}$/.test(evidenceId) || !validGym(state)) throw Error("Invalid trusted gym progress");
  if (alumni.length !== state.alumni.length + (state.alumniArchive?.count ?? 0)) throw Error("Complete verified alumni history is required");
  const candidates = [];
  if (previousBest) candidates.push(previousBest);
  const add = (player2, value) => {
    if (!templateById(player2.templateId)) return;
    candidates.push({ playerId: player2.id, templateId: player2.templateId, value, level: player2.level, stats: { ...player2.stats } });
  };
  for (const player2 of [state.player, ...state.bench]) if (player2) add(player2, playerValue(state, player2));
  for (const player2 of alumni) add(player2, player2.finalValue);
  for (const player2 of candidates) {
    if (!templateById(player2.templateId) || !/^(0|[1-9]\d{0,159})$/.test(player2.value) || !Number.isInteger(player2.level) || player2.level < 0 || player2.level > 99 || !statKeys.every((key) => Number.isInteger(player2.stats[key]) && player2.stats[key] >= 0 && player2.stats[key] <= 99)) throw Error("Invalid previous verified player record");
  }
  const best = candidates.reduce((record2, player2) => !record2 || BigInt(player2.value) > BigInt(record2.value) ? player2 : record2, null);
  return { puid: binding.actor, runId: binding.runId, revision: state.revision, evidenceId, fame: state.fame, best: best ? structuredClone(best) : null };
}
function buildAuthorityGymRankingProgress(document, evidenceId) {
  if (document.provenance !== "server-created" || !document.state) return null;
  const state = document.state, runId = `${state.createdAt}-${state.seed}`, previous = document.ranking;
  if (document.applicationId !== activity_default.activityId || !validGym(state)) throw Error("Invalid canonical ranking state");
  if (previous && (previous.puid !== document.actorId || previous.runId !== runId || previous.revision > state.revision || !Number.isSafeInteger(previous.historyCount) || previous.historyCount < 0)) throw Error("Invalid ranking checkpoint binding");
  const archived = state.alumniArchive?.count ?? 0;
  if (archived > (previous?.historyCount ?? 0)) throw Error("Verified ranking history checkpoint is incomplete");
  const hotState = { ...state };
  delete hotState.alumniArchive;
  const progress = verifiedGymRankingProgress({
    binding: { applicationId: document.applicationId, actor: document.actorId, runId },
    evidenceId,
    // The previous trusted maximum covers cold records. This view intentionally
    // removes only the archive counter; the canonical document stays untouched.
    state: hotState,
    alumni: state.alumni,
    previousBest: previous?.best
  });
  if (previous?.revision === state.revision) {
    if (previous.fame !== progress.fame || JSON.stringify(previous.best) !== JSON.stringify(progress.best)) throw Error("Ranking changed without a canonical revision");
    return structuredClone(previous);
  }
  return { ...progress, historyCount: state.alumni.length + archived };
}

// server/gymAuthorityService.ts
var allowedActions = {
  train: ["id"],
  recommend: ["id"],
  "use-drink": ["id"],
  recruit: ["preference", "mode", "direction", "expectedNextPlayer", "selectRecruited"],
  "buy-equipment": ["id", "replaceId", "destination"],
  equip: ["id", "replaceId"],
  unequip: ["id"],
  "sell-equipment": ["id"],
  "upgrade-project": ["id"],
  "set-training-plan": ["id", "playerId", "scope"],
  "accept-cooperation": ["id", "playerId", "scope"],
  "abandon-cooperation": ["playerId", "scope"],
  "share-player-levels": ["playerId"],
  "restore-stamina-reward": ["playerId", "method", "expectedCount"],
  "double-offline-experience": ["reportId"],
  "dismiss-offline-report": ["reportId"],
  "complete-cooperation-ad": ["id", "playerId", "expectedCooperationId", "expectedCooperationRevision", "scope"],
  "select-player": ["id"],
  "set-auto": ["id", "enabled"],
  "buy-drink": [],
  "buy-consumable": ["id"],
  "use-consumable": ["id", "playerId"],
  "upgrade-gym": ["targetLevel"]
};
var protectedActions = /* @__PURE__ */ new Set(["share-player-levels", "restore-stamina-reward", "complete-cooperation-ad", "double-offline-experience"]);
var rewardMethod = (action) => action.type === "share-player-levels" || action.type === "restore-stamina-reward" && action.method === "share" ? "post" : "ad";
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var integer3 = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function parseArchive(value) {
  try {
    return parseGymCloudArchive(value);
  } catch {
    throw authorityFailure("ARCHIVE_INVALID", 400, false, "\u672C\u5730\u6863\u6848\u65E0\u6548\uFF0C\u539F\u8FDB\u5EA6\u5DF2\u4FDD\u7559");
  }
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).filter((key) => value[key] !== void 0).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
var digest = (value) => createHash2("sha256").update(canonical(value)).digest("hex");
function checkActor(actor) {
  if (!actor || typeof actor.id !== "string" || !actor.id.trim() || actor.id.length > 200 || /[\u0000-\u001f]/.test(actor.id)) throw authorityFailure("AUTH_REQUIRED", 401, false, "\u8BF7\u5148\u767B\u5F55\u864E\u6251");
}
function checkAction(value) {
  const reject = () => {
    throw authorityFailure("ACTION_INVALID", 400, false, "\u6E38\u620F\u64CD\u4F5C\u53C2\u6570\u65E0\u6548");
  };
  if (!object(value) || typeof value.type !== "string" || !Object.hasOwn(allowedActions, value.type)) reject();
  const action = value, type = action.type, fields = allowedActions[type];
  if (Object.keys(action).some((key) => key !== "type" && !fields.includes(key))) reject();
  const id2 = (field, required = false) => {
    if (action[field] === void 0 && !required) return;
    if (typeof action[field] !== "string" || !/^[A-Za-z0-9_:-]{1,120}$/.test(action[field])) reject();
  };
  const choice = (field, choices, required = false) => {
    if (action[field] === void 0 && !required) return;
    if (!choices.includes(action[field])) reject();
  };
  if (fields.includes("id")) id2("id", true);
  if (fields.includes("playerId")) id2("playerId", true);
  if (fields.includes("replaceId")) id2("replaceId");
  if (fields.includes("reportId")) id2("reportId", true);
  if (fields.includes("scope")) choice("scope", ["roster"]);
  if (fields.includes("destination")) choice("destination", ["warehouse"]);
  if (type === "set-training-plan") choice("id", ["balanced", "shooting", "finishing", "interior"], true);
  if (type === "set-auto" && typeof action.enabled !== "boolean") reject();
  if (type === "recruit") {
    choice("preference", ["any", "guard", "forward", "center"]);
    choice("mode", ["selected"]);
    choice("direction", ["shooting", "finishing", "interior"]);
    if (action.mode === "selected" && action.direction === void 0 || action.direction !== void 0 && action.mode !== "selected") reject();
    if (action.expectedNextPlayer !== void 0 && (!integer3(action.expectedNextPlayer) || action.expectedNextPlayer < 1)) reject();
    if (action.selectRecruited !== void 0 && typeof action.selectRecruited !== "boolean") reject();
  }
  if (type === "restore-stamina-reward") {
    choice("method", ["share", "ad"], true);
    if (!integer3(action.expectedCount)) reject();
  }
  if (type === "complete-cooperation-ad") {
    if (action.expectedCooperationId !== null) {
      id2("expectedCooperationId", true);
    }
    if (action.expectedCooperationRevision !== null && !integer3(action.expectedCooperationRevision)) reject();
  }
  if (type === "upgrade-gym" && action.targetLevel !== void 0 && (!integer3(action.targetLevel) || action.targetLevel < 2 || action.targetLevel > 8)) reject();
}
function checkPayload(value, kind) {
  const fields = ["epoch", "requestId", ...kind === "action" ? ["expectedRevision", "action", "rewardProof"] : kind === "adopt" ? ["archive"] : ["expectedRevision"]];
  if (!object(value) || Object.keys(value).some((key) => !fields.includes(key)) || typeof value.epoch !== "string" || typeof value.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_:-]{0,99}$/.test(value.requestId) || ["constructor", "prototype", "__proto__"].includes(value.requestId) || value.expectedRevision !== void 0 && !integer3(value.expectedRevision)) throw authorityFailure("REQUEST_INVALID", 400, false, "\u8BF7\u6C42\u53C2\u6570\u65E0\u6548");
  if (kind === "action") {
    if (!integer3(value.expectedRevision)) throw authorityFailure("REQUEST_INVALID", 400);
    checkAction(value.action);
  }
  if (value.rewardProof !== void 0 && Buffer.byteLength(JSON.stringify(value.rewardProof)) > 16384) throw authorityFailure("REQUEST_INVALID", 400);
  if (kind === "adopt" && (typeof value.archive !== "string" || Buffer.byteLength(value.archive) > 2 * 1024 * 1024)) throw authorityFailure("ARCHIVE_INVALID", 400, false, "\u672C\u5730\u6863\u6848\u65E0\u6548\u6216\u8D85\u8FC72MiB");
}
function rebaseLegacyGym(source, anchor) {
  const next = structuredClone(source), before = next.updatedAt, delta = anchor - before;
  const shift = (value) => {
    const shifted = value === 0 ? 0 : value + delta;
    if (!integer3(shifted)) throw authorityFailure("ARCHIVE_TIME_INVALID", 400, false, "\u65E7\u6863\u65F6\u95F4\u65E0\u6CD5\u8FC1\u79FB\uFF0C\u539F\u672C\u5730\u6863\u6848\u5DF2\u4FDD\u7559");
    return shifted;
  };
  next.createdAt = shift(next.createdAt);
  next.updatedAt = anchor;
  for (const player2 of [next.player, ...next.bench, ...next.alumni]) if (player2) {
    player2.enteredAt = shift(player2.enteredAt);
    player2.nextShotAt = anchor + Math.max(0, player2.nextShotAt - before);
    if ("recommendedAt" in player2) player2.recommendedAt = shift(player2.recommendedAt);
  }
  for (const collection of [next.collection, next.collectedEquipment, next.legacyEquipmentCollection]) if (collection) for (const item of Object.values(collection)) item.firstAt = shift(item.firstAt);
  if (next.nextShotAt !== void 0) next.nextShotAt = anchor + Math.max(0, next.nextShotAt - before);
  next.offlineRulesVersion = 2;
  next.revision++;
  delete next.offlineReward;
  const finished = finishEquipmentMigration(next);
  if (!validGym(finished) || finished.alumniArchive?.count) throw authorityFailure("ARCHIVE_INVALID", 400, false, "\u65E7\u6863\u6821\u9A8C\u5931\u8D25\uFF0C\u539F\u672C\u5730\u6863\u6848\u5DF2\u4FDD\u7559");
  return finished;
}
function createGymAuthorityService(options) {
  const { repository, clockFactory, environmentId, verifyReward } = options, now = options.now ?? Date.now, seed = options.randomSeed ?? (() => randomBytes(4).readUInt32BE());
  const applicationId = activity_default.activityId, workspaceId = options.workspaceId ?? applicationId;
  if (!repository || !clockFactory || !environmentId || typeof window !== "undefined") throw Error("Server authority requires configured repository, clock and environment");
  const key = (actor) => digest({ applicationId, environmentId, actor: actor.id });
  const guard = async (work) => {
    try {
      return await work();
    } catch (error) {
      const value = object(error) ? error : {};
      if (typeof value.code === "string" && Number.isInteger(value.statusCode)) throw error;
      throw authorityFailure("TIMEFLOW_UNAVAILABLE", 503, value.retryable === true, "\u5E73\u53F0\u79BB\u7EBF\u7ED3\u7B97\u6682\u4E0D\u53EF\u7528\uFF0C\u5DF2\u4FDD\u5B58\u8FDB\u5EA6\u4FDD\u7559");
    }
  };
  const binding = (doc) => ({ applicationId, environmentId, workspaceId, scopeType: "gym", scopeId: doc.scopeId, state: "active", displayName: `\u4F20\u5947\u7403\u9986 \xB7 ${environmentId} \xB7 ${doc.epoch}` });
  const snapshot = (doc, result = { events: [] }, pending, replayed = false) => ({ applicationId, epoch: doc.epoch, hasSave: !!doc.state, mode: "timeflow", serverTime: doc.state?.updatedAt ?? now(), revision: doc.state?.revision ?? 0, ...doc.state ? { state: structuredClone(doc.state) } : {}, events: result?.events ?? [], ...doc.state?.offlineReward && !doc.state.offlineReward.dismissed ? { offlineReport: doc.state.offlineReward.report } : result?.offlineReport ? { offlineReport: result.offlineReport } : {}, ...result?.error ? { error: result.error } : {}, ...pending ? { pending } : {}, ...replayed ? { replayed: true } : {}, capabilities: { platformRewards: !!verifyReward || options.allowNativeRewards === true, legacyAdoption: !doc.state } });
  function nativeConfirmation(doc, action, proof, id2) {
    if (!options.allowNativeRewards || !object(proof) || Object.keys(proof).some((k) => !["challengeId", "confirmation"].includes(k)) || proof.confirmation !== "native-sdk-confirmation" || typeof proof.challengeId !== "string") return false;
    const challenge = doc.rewardChallenges?.[proof.challengeId];
    if (!challenge || challenge.actionHash !== digest(action) || challenge.method !== rewardMethod(action) || challenge.expiresAt < now() || challenge.consumedBy && challenge.consumedBy !== id2) return false;
    challenge.consumedBy = id2;
    return true;
  }
  async function initial(tx, actor) {
    if (tx.document) {
      const d = tx.document;
      if (d.actorId !== actor.id || d.applicationId !== applicationId || d.environmentId !== environmentId || d.workspaceId !== workspaceId) throw authorityFailure("APP_NOT_AUTHORIZED", 403);
      return d;
    }
    const numeric = BigInt("0x" + randomBytes(7).toString("hex")) + 1n;
    return tx.commit({ version: 1, applicationId, environmentId, workspaceId, actorId: actor.id, epoch: randomUUID2(), scopeId: numeric.toString(), scopeType: "gym", initialized: false, state: null, suspended: true, provenance: null, commands: {}, pendingCommandId: null, settlements: {} });
  }
  async function process(tx, doc, actor, id2) {
    let command2 = doc.commands[id2];
    const responseUnknown = () => authorityFailure("SETTLEMENT_RESPONSE_UNKNOWN", 409, true, "\u5E73\u53F0\u7ED3\u7B97\u786E\u8BA4\u6682\u65F6\u4E2D\u65AD\uFF0C\u539F\u8FDB\u5EA6\u5DF2\u4FDD\u7559\uFF0C\u91CD\u65B0\u8FDE\u63A5\u540E\u7EE7\u7EED\u6062\u590D");
    const clock = clockFactory(binding(doc));
    const commit = async () => {
      doc = await tx.commit(doc);
      command2 = doc.commands[id2];
    };
    const clockKey = (phase) => "gym_" + digest({ epoch: doc.epoch, id: id2, phase }).slice(0, 60);
    if (command2.status === "submitting") {
      command2.recoveryAttempts = (command2.recoveryAttempts ?? 0) + 1;
      command2.payload.baselineAttempt = (integer3(command2.payload.baselineAttempt) ? command2.payload.baselineAttempt : 0) + 1;
      command2.status = "prepared";
      await commit();
    }
    if (!doc.initialized) {
      await clock.ensure({ requestId: clockKey("ensure") });
      doc.initialized = true;
      await commit();
    }
    if (command2.status === "applied") {
      if (digest(command2.report) !== doc.settlements[command2.settlementId]?.reportHash) throw authorityFailure("SETTLEMENT_CONFLICT", 409, false, "\u7ED3\u7B97\u62A5\u544A\u5185\u5BB9\u4E0E\u6301\u4E45\u8BB0\u5F55\u4E0D\u4E00\u81F4");
      try {
        await clock.ack(command2.report);
      } catch (error) {
        return snapshot(doc, command2.result, { pollAfterMs: 1e3, stage: "ack", retryable: error?.retryable === true });
      }
      doc.settlements[command2.settlementId].status = "acked";
      if (command2.checkpointOnly) {
        command2.status = "prepared";
        command2.payload.baselineAttempt = (integer3(command2.payload.baselineAttempt) ? command2.payload.baselineAttempt : 0) + 1;
        delete command2.checkpointOnly;
        delete command2.report;
        delete command2.settlementId;
        await commit();
        return snapshot(doc, void 0, { pollAfterMs: 250, stage: "settlement", retryable: true });
      }
      if (!doc.state) {
        command2.status = "prepared";
        command2.payload.baselineAttempt = (integer3(command2.payload.baselineAttempt) ? command2.payload.baselineAttempt : 0) + 1;
        delete command2.report;
        delete command2.settlementId;
        await commit();
        return snapshot(doc, void 0, { pollAfterMs: 250, stage: "baseline", retryable: true });
      }
      command2.status = "done";
      doc.pendingCommandId = null;
      delete command2.report;
      await commit();
      return snapshot(doc, command2.result);
    }
    const attempt = integer3(command2.payload.baselineAttempt) ? command2.payload.baselineAttempt : 0;
    if (command2.status === "prepared" && command2.async === void 0) {
      command2.async = !!doc.state && now() - doc.state.updatedAt >= 5 * 6e4;
      await commit();
    }
    let response;
    if (command2.status === "received" && command2.settlementId && command2.report) response = { status: "ready", settlementId: command2.settlementId, report: command2.report };
    else if (command2.status === "pending" && command2.settlementId) response = await clock.resume({ settlementId: command2.settlementId, async: command2.async, maxPolls: 0 });
    else if (command2.status === "prepared") {
      command2.status = "submitting";
      await commit();
      try {
        response = await clock.settle({ requestId: clockKey("settle:" + attempt), trigger: doc.state ? "foreground" : "login", async: command2.async === true });
      } catch (error) {
        const failure2 = error;
        return snapshot(doc, void 0, { pollAfterMs: integer3(failure2?.retryAfterMs) ? Math.min(3e4, Math.max(250, failure2.retryAfterMs)) : 1e3, stage: "settlement", retryable: failure2?.retryable === true });
      }
    } else throw responseUnknown();
    if (typeof response.settlementId !== "string" || !/^[A-Za-z0-9_:-]{1,64}$/.test(response.settlementId)) throw responseUnknown();
    if (response.status === "pending") {
      command2.status = "pending";
      command2.settlementId = response.settlementId;
      await commit();
      return snapshot(doc, void 0, { pollAfterMs: Math.max(250, response.pollAfterMs ?? 1e3), stage: "settlement", retryable: response.retryable !== false });
    }
    if (command2.status !== "received") {
      command2.status = "received";
      command2.settlementId = response.settlementId;
      command2.report = response.report;
      await commit();
    }
    let interval;
    try {
      interval = command2.recoveryAttempts && doc.state ? extractGymRecoveryClockInterval(response.report, clock.streamKey, doc.state.updatedAt) : extractGymClockInterval(response.report, clock.streamKey, doc.state?.updatedAt);
    } catch {
      throw authorityFailure("CLOCK_REPORT_INVALID", 409, false, "\u5E73\u53F0\u65F6\u95F4\u62A5\u544A\u65E0\u6CD5\u4E0E\u5DF2\u4FDD\u5B58\u6E38\u6807\u5BF9\u9F50\uFF0C\u5DF2\u6682\u505C\u7ED3\u7B97");
    }
    const prior = doc.settlements[response.settlementId];
    const reportHash = digest(response.report);
    if (prior && (prior.commandId !== id2 || prior.reportHash !== reportHash)) throw authorityFailure("SETTLEMENT_CONFLICT", 409, false, "\u5E73\u53F0\u7ED3\u7B97\u53F7\u6216\u62A5\u544A\u5185\u5BB9\u4E0E\u5DF2\u63D0\u4EA4\u64CD\u4F5C\u51B2\u7A81");
    if (command2.recoveryAttempts && doc.state && !interval) {
      command2.checkpointOnly = true;
      command2.result = { events: [] };
      command2.status = "applied";
      doc.settlements[response.settlementId] = { commandId: id2, status: "applied", cursor: doc.state.updatedAt, reportHash };
      await commit();
      try {
        await clock.ack(command2.report);
      } catch (error) {
        return snapshot(doc, void 0, { pollAfterMs: 1e3, stage: "ack", retryable: error?.retryable === true });
      }
      doc.settlements[response.settlementId].status = "acked";
      command2.status = "prepared";
      command2.payload.baselineAttempt = attempt + 1;
      delete command2.checkpointOnly;
      delete command2.report;
      delete command2.settlementId;
      await commit();
      return snapshot(doc, void 0, { pollAfterMs: 250, stage: "settlement", retryable: true });
    }
    if (!doc.state && !interval) {
      command2.status = "applied";
      command2.result = { events: [] };
      doc.settlements[response.settlementId] = { commandId: id2, status: "applied", cursor: 0, reportHash };
      await commit();
      try {
        await clock.ack(command2.report);
      } catch (error) {
        return snapshot(doc, void 0, { pollAfterMs: 1e3, stage: "ack", retryable: error?.retryable === true });
      }
      doc.settlements[response.settlementId].status = "acked";
      command2.status = "prepared";
      command2.payload.baselineAttempt = attempt + 1;
      delete command2.report;
      delete command2.settlementId;
      await commit();
      return snapshot(doc, void 0, { pollAfterMs: 250, stage: "baseline", retryable: true });
    }
    let result = { events: [] };
    if (!doc.state) {
      if (command2.kind !== "start" && command2.kind !== "adopt") throw authorityFailure("GYM_REQUIRED", 409, false, "\u8BF7\u5148\u5F00\u8BBE\u8BAD\u7EC3\u9986");
      const anchor = interval.to;
      if (command2.kind === "start") {
        const random2 = seed();
        if (!integer3(random2) || random2 > 4294967295) throw Error("Invalid server seed");
        doc.state = newGym(anchor, random2);
        doc.provenance = "server-created";
      } else {
        doc.state = rebaseLegacyGym(parseArchive(command2.payload.archive).state, anchor);
        doc.provenance = "legacy-unverified";
        delete command2.payload.archive;
      }
      doc.suspended = false;
    } else {
      const current = doc.state;
      if (interval && interval.from > current.updatedAt) throw authorityFailure("CLOCK_GAP", 409, false, "\u5E73\u53F0\u65F6\u95F4\u4E0E\u5DF2\u4FDD\u5B58\u6E38\u6807\u4E4B\u95F4\u5B58\u5728\u7F3A\u53E3\uFF0C\u5DF2\u6682\u505C\u7ED3\u7B97");
      const end = interval ? Math.max(current.updatedAt, interval.to) : current.updatedAt;
      const resumed = command2.kind === "resume" || doc.suspended || !!command2.recoveryAttempts || end - current.updatedAt >= 1e4;
      const available = interval ? interval.effectiveDuration : 0;
      const onlineEvents = [];
      const collect = end - current.updatedAt < 5e3 && !doc.suspended ? (events) => {
        onlineEvents.push(...events);
        if (onlineEvents.length > 64) onlineEvents.splice(0, onlineEvents.length - 64);
      } : void 0;
      const replay = settleOfflineGym(current, end, Math.min(available, resumed ? offlineLimitMs(current) : available), collect);
      doc.state = { ...replay.state, offlineRulesVersion: 2 };
      result.events = onlineEvents;
      if (resumed && replay.report && end - current.updatedAt >= 5e3 && replay.report.totalShots > 0) result.offlineReport = replay.report;
      if (command2.kind === "action") {
        const action = command2.payload.action;
        let verified = true;
        if (protectedActions.has(action.type)) verified = verifyReward ? await verifyReward(actor, action, command2.payload.rewardProof, { epoch: doc.epoch, requestId: id2 }) : nativeConfirmation(doc, action, command2.payload.rewardProof, id2);
        if (!verified) result.error = "\u5E73\u53F0\u5956\u52B1\u5C1A\u672A\u5B8C\u6210\u670D\u52A1\u5668\u6821\u9A8C\uFF0C\u672A\u53D1\u653E\u5956\u52B1";
        else {
          const dispatched = dispatchGym(doc.state, doc.state.revision, action, doc.state.updatedAt);
          doc.state = dispatched.state;
          result.events.push(...dispatched.events);
          if (dispatched.error) result.error = dispatched.error;
        }
      }
      doc.suspended = command2.kind === "suspend";
    }
    if (!validGym(doc.state)) throw authorityFailure("STATE_INVALID");
    if (doc.provenance === "server-created" && !doc.ranking && (doc.state.alumniArchive?.count ?? 0) > 0) {
      const archived = doc.state.alumniArchive.count, persisted = tx.document?.state;
      const incomplete = () => authorityFailure("HISTORY_INCOMPLETE", 503, false, "\u7403\u9986\u5386\u53F2\u6863\u6848\u4E0D\u5B8C\u6574\uFF0C\u5DF2\u4FDD\u7559\u539F\u8FDB\u5EA6\u5E76\u6682\u505C\u6392\u884C\u7ED3\u7B97");
      if (!persisted || persisted.createdAt !== doc.state.createdAt || persisted.seed !== doc.state.seed || (persisted.alumniArchive?.count ?? 0) !== archived) throw incomplete();
      const hotCount = persisted.alumni.length, total = hotCount + archived, cold = [];
      const ids = new Set(doc.state.alumni.map((player2) => player2.id));
      while (cold.length < archived) {
        const limit = Math.min(100, archived - cold.length), page2 = await tx.alumni(hotCount + cold.length, limit);
        if (!page2 || page2.total !== total || !Array.isArray(page2.players) || page2.players.length !== limit) throw incomplete();
        for (const player2 of page2.players) {
          if (!validGymAlumnus(player2, doc.state) || ids.has(player2.id)) throw incomplete();
          ids.add(player2.id);
          cold.push(player2);
        }
      }
      doc.ranking = { ...verifiedGymRankingProgress({
        binding: { applicationId, actor: doc.actorId, runId: `${doc.state.createdAt}-${doc.state.seed}` },
        evidenceId: response.settlementId,
        state: doc.state,
        alumni: [...cold, ...doc.state.alumni]
      }), historyCount: archived + doc.state.alumni.length };
    } else doc.ranking = buildAuthorityGymRankingProgress(doc, response.settlementId);
    command2.result = result;
    command2.status = "applied";
    doc.settlements[response.settlementId] = { commandId: id2, status: "applied", cursor: doc.state.updatedAt, reportHash };
    await commit();
    try {
      await clock.ack(command2.report);
    } catch (error) {
      return snapshot(doc, result, { pollAfterMs: 1e3, stage: "ack", retryable: error?.retryable === true });
    }
    doc.settlements[response.settlementId].status = "acked";
    command2.status = "done";
    doc.pendingCommandId = null;
    delete command2.report;
    const done = Object.entries(doc.commands).filter(([, value]) => value.status === "done").sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [old] of done.slice(0, Math.max(0, done.length - 256))) delete doc.commands[old];
    const receipts = Object.entries(doc.settlements).filter(([, value]) => value.status === "acked");
    for (const [old] of receipts.slice(0, Math.max(0, receipts.length - 1024))) delete doc.settlements[old];
    await commit();
    return snapshot(doc, result);
  }
  async function command(actor, payload, kind) {
    checkActor(actor);
    checkPayload(payload, kind);
    return guard(() => repository.withActor(key(actor), async (tx) => {
      let doc = await initial(tx, actor);
      if (payload.epoch !== doc.epoch) throw authorityFailure("EPOCH_MISMATCH", 409, false, "\u8D26\u53F7\u6216\u7403\u9986\u5DF2\u5207\u6362\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
      const fingerprint = digest({ kind, payload });
      const existing = Object.hasOwn(doc.commands, payload.requestId) ? doc.commands[payload.requestId] : null;
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw authorityFailure("IDEMPOTENCY_KEY_MISMATCH", 409, false, "\u540C\u4E00\u64CD\u4F5C\u6807\u8BC6\u4E0D\u80FD\u7528\u4E8E\u4E0D\u540C\u8BF7\u6C42");
        if (existing.status === "done") return snapshot(doc, existing.result, void 0, true);
        return process(tx, doc, actor, payload.requestId);
      }
      if (doc.pendingCommandId) {
        const recovered = await process(tx, doc, actor, doc.pendingCommandId);
        if (recovered.pending) return recovered;
        doc = tx.document;
      }
      if ((kind === "start" || kind === "adopt") && doc.state) throw authorityFailure("GYM_ALREADY_EXISTS", 409, false, "\u5F53\u524D\u7403\u9986\u5DF2\u5F00\u8BBE\uFF0C\u8BF7\u7EE7\u7EED\u7ECF\u8425");
      if (kind !== "start" && kind !== "adopt" && !doc.state) throw authorityFailure("GYM_REQUIRED", 409, false, "\u8BF7\u5148\u5F00\u8BBE\u8BAD\u7EC3\u9986");
      if (payload.expectedRevision !== void 0 && payload.expectedRevision !== (doc.state?.revision ?? 0)) throw authorityFailure("REVISION_CONFLICT", 409, true, "\u7403\u9986\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u8FDB\u5EA6\u540E\u91CD\u8BD5");
      if (kind === "adopt") parseArchive(payload.archive);
      doc.commands[payload.requestId] = { kind, fingerprint, payload: structuredClone(payload), status: "prepared", createdAt: now() };
      doc.pendingCommandId = payload.requestId;
      doc = await tx.commit(doc);
      return process(tx, doc, actor, payload.requestId);
    }));
  }
  return Object.freeze({
    async prepareReward(actor, payload) {
      checkActor(actor);
      if (!object(payload) || Object.keys(payload).some((k) => !["epoch", "action"].includes(k))) throw authorityFailure("REQUEST_INVALID", 400);
      checkAction(payload.action);
      if (!options.allowNativeRewards || !protectedActions.has(payload.action.type)) throw authorityFailure("REWARD_UNAVAILABLE", 409, false, "\u5F53\u524D\u5956\u52B1\u6682\u4E0D\u53EF\u7528");
      return guard(() => repository.withActor(key(actor), async (tx) => {
        let doc = await initial(tx, actor);
        if (payload.epoch !== doc.epoch) throw authorityFailure("EPOCH_MISMATCH", 409, false, "\u8D26\u53F7\u6216\u7403\u9986\u5DF2\u5207\u6362");
        if (doc.pendingCommandId) {
          const recovered = await process(tx, doc, actor, doc.pendingCommandId);
          if (recovered.pending) throw authorityFailure("SETTLEMENT_PENDING", 409, true, "\u79BB\u7EBF\u6536\u76CA\u6B63\u5728\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u540E\u9886\u53D6");
          doc = tx.document;
        }
        if (!doc.state) throw authorityFailure("GYM_REQUIRED", 409);
        const preview = dispatchGym(doc.state, doc.state.revision, payload.action, doc.state.updatedAt);
        if (preview.error) throw authorityFailure("REWARD_INELIGIBLE", 409, false, preview.error);
        const challengeId = randomUUID2(), expiresAt = now() + 15 * 6e4;
        const challenges = doc.rewardChallenges ?? {};
        for (const [id2, entry] of Object.entries(challenges)) if (entry.expiresAt < now()) delete challenges[id2];
        if (Object.keys(challenges).length >= 128) throw authorityFailure("RATE_LIMITED", 429, true, "\u5956\u52B1\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
        challenges[challengeId] = { actionHash: digest(payload.action), method: rewardMethod(payload.action), expiresAt };
        doc.rewardChallenges = challenges;
        await tx.commit(doc);
        return { challengeId, expiresAt, method: rewardMethod(payload.action), confirmation: "native-sdk-confirmation" };
      }));
    },
    async session(actor) {
      checkActor(actor);
      return guard(() => repository.withActor(key(actor), async (tx) => {
        const doc = await initial(tx, actor);
        return doc.pendingCommandId ? process(tx, doc, actor, doc.pendingCommandId) : snapshot(doc);
      }));
    },
    start: (actor, payload) => command(actor, payload, "start"),
    adopt: (actor, payload) => command(actor, payload, "adopt"),
    action: (actor, payload) => command(actor, payload, "action"),
    resume: (actor, payload) => command(actor, payload, "resume"),
    suspend: (actor, payload) => command(actor, payload, "suspend"),
    async alumni(actor, payload) {
      checkActor(actor);
      if (!object(payload) || Object.keys(payload).some((key2) => !["epoch", "offset", "limit"].includes(key2)) || !integer3(payload.offset ?? 0) || !integer3(payload.limit ?? 20) || (payload.limit ?? 20) < 1 || (payload.limit ?? 20) > 100) throw authorityFailure("REQUEST_INVALID", 400);
      return guard(() => repository.withActor(key(actor), async (tx) => {
        const doc = await initial(tx, actor);
        if (payload.epoch !== doc.epoch) throw authorityFailure("EPOCH_MISMATCH", 409);
        return tx.alumni(payload.offset ?? 0, payload.limit ?? 20);
      }));
    }
  });
}

// server/gymAuthorityHttp.ts
function createGymAuthorityHttpHandler({ service, authenticate, allowedOrigin }) {
  if (!service || typeof authenticate !== "function") throw Error("A trusted authenticator is required");
  if (allowedOrigin) {
    const origin = new URL(allowedOrigin);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== allowedOrigin) throw Error("Invalid allowed origin");
  }
  return async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const origin = request.headers.origin;
    if (origin && allowedOrigin && origin !== allowedOrigin) {
      response.writeHead(403);
      response.end(JSON.stringify({ code: "ORIGIN_DENIED", message: "\u8BF7\u6C42\u6765\u6E90\u4E0D\u5141\u8BB8", retryable: false }));
      return;
    }
    if (origin && origin === allowedOrigin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Gym-Dev-Session");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      const actor = await authenticate(request);
      if (!actor) throw authorityFailure("AUTH_REQUIRED", 401, false, "\u8BF7\u5148\u767B\u5F55\u864E\u6251");
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.search) throw authorityFailure("REQUEST_INVALID", 400, false, "\u4E0D\u63A5\u53D7\u67E5\u8BE2\u8EAB\u4EFD\u6216\u65F6\u95F4\u53C2\u6570");
      const path = url.pathname.replace(/^\/api(?=\/|$)/, "");
      let body = {};
      if (request.method === "POST") {
        let text2 = "", bytes = 0;
        for await (const chunk of request) {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 6 * 1024 * 1024) throw authorityFailure("BODY_TOO_LARGE", 413);
          text2 += chunk;
        }
        try {
          body = JSON.parse(text2);
        } catch {
          throw authorityFailure("REQUEST_INVALID", 400, false, "\u8BF7\u6C42\u683C\u5F0F\u65E0\u6548");
        }
      }
      let data;
      if (path === "/gym/session" && ["GET", "POST"].includes(request.method ?? "")) {
        if (request.method === "POST" && (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) throw authorityFailure("REQUEST_INVALID", 400);
        data = await service.session(actor);
      } else if (request.method === "POST" && path === "/gym/start") data = await service.start(actor, body);
      else if (request.method === "POST" && path === "/gym/rewards/prepare") data = await service.prepareReward(actor, body);
      else if (request.method === "POST" && path === "/gym/adopt") data = await service.adopt(actor, body);
      else if (request.method === "POST" && path === "/gym/actions") data = await service.action(actor, body);
      else if (request.method === "POST" && path === "/gym/resume") data = await service.resume(actor, body);
      else if (request.method === "POST" && path === "/gym/suspend") data = await service.suspend(actor, body);
      else if (request.method === "POST" && path === "/gym/alumni") data = await service.alumni(actor, body);
      else throw authorityFailure("NOT_FOUND", 404, false, "\u63A5\u53E3\u4E0D\u5B58\u5728");
      response.writeHead(200);
      response.end(JSON.stringify({ code: 0, data }));
    } catch (error) {
      const value = error && typeof error === "object" ? error : {};
      const safe = typeof value.code === "string" && /^[A-Z][A-Z0-9_]{0,80}$/.test(value.code) && Number.isInteger(value.statusCode) && Number(value.statusCode) >= 400 && Number(value.statusCode) <= 599;
      const status = safe ? Number(value.statusCode) : 503;
      response.writeHead(status);
      response.end(JSON.stringify({ code: safe ? value.code : "SERVICE_UNAVAILABLE", message: safe ? String(value.message) : "\u7403\u9986\u670D\u52A1\u6682\u4E0D\u53EF\u7528\uFF0C\u5DF2\u4FDD\u5B58\u8FDB\u5EA6\u4FDD\u7559", retryable: safe ? value.retryable === true : false }));
    }
  };
}
export {
  createCloudBaseGymAuthorityRepository,
  createFileGymAuthorityRepository,
  createGymAuthorityHttpHandler,
  createGymAuthorityService
};
