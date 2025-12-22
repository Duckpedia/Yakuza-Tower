# Entity
 ma en array komponent k drzijo neke podatke / se updateajo pa take.
Ma tud children pa (lahko) enga parenta, isto k scene graf iz kolokvija, transformacije od parenta se applyjajo na childe. soba -> miza -> skleda -> jabuk 

entityja loh nardis na roke tko kt je floor v main.js, lah ga pa zloadas iz gltf (exportan iz blenderja) in pol cela struktura zgleda isto kt v blenderju kr je ful nice, pa mas se skleton pa materiale pa vse avtomatsko

te zloadani iz gltf majo tud imena tkoda jih loh iscete po imenih ce jih rabte, findChildByName funckija, ista so k u blenderju.

Ce je biu entity narejen z loader.buildEntityFromScene (as it should be)
collecta po vseh svojih otrokih stvari in ma properyje:
 - skeleton: reference na skeleton na kermu loh playate animacije
 - models: array modelov k se risejo, eni 3d stvari so narjeni iz vecih, ce to pride prov 
 - animations: array animacij iz skeletona, da loh vidte kere so available alneki idk

# Komponente:
- Transform:
    - translation, glm.vec3
    - rotation, pref quaternion, glm.quat funkcije
    - scale, vektor, glm.vec3
    - s tem neki premikas okol, brez tega se nau risal
    - Interno je še matrix (local) in final (world).
    - final se avtomatsko preračuna v update passu, ga ne nastavlat rocno
- Model:
    - 3d model, zloadas ga z GLTFLoaderjem, je u main.js example
    - brez tega se tud nau risal
    - Model samo drži geometrijo + material info, nič logike
- Skeleton:
    - na njem playas animacije z playAnimation, setAnimationByIndex...
- PlayerComponent, EnemyComponent ...:
    - loh majo funkcijo update k se klice usak frame

lah jih uporabte sam za shrant podatke za neki (transformacija), jim dt neko funcionalnsot (update), alpa sam da jih oznacte z necim npr OnFire alpakej mogoce

# tips and tricks

javascript je dost funky, vse v njem je Object, funkcije, libraryji, arrayji pa nvm kaj use. za basically use loh console.log(neki), in pol vidte kere memberje ma alpa ce stisnete prototype vidte se kere funkcije. 

``` js
    import * as glm from '/glm.js'
    console.log(glm) // vids use funkcije k so v glm
```

use v javascriptu je se sharea po referenci, to je zlo pogost issue k passas po funkcijah okol stvari
``` js
const a = { x: 1 };
const b = a;
b.x = 5;
console.log(a.x); // 5, ker a in b kažeta na isti object

// shallow copy nardis z:
const copy = { ...a }; // alpa ce ma .clone() funkcijo
```

ce napises neki kar ne obstaja vecino casa dobis sam undefined in nobenga errorja tkoda bodte pazljivi na typote:

entity.name = "xd"
console.log(entity.nmae) -> "undefined"

da je neki undefined alpa null (to sta razlicni stvari!) je isto kt da je false kinda tkoda zgori bi, nikol ne uporablat undefined, ce hocte rect da necesa ni uprabte null. ni realne razlike sam fajn je bit consistent

if(!entity.name)
    console.log("entity nima imena")

zmeri uporablite const pa let, nikol var

``` js
    const x = 1; // OK
    let y = 2 // OK
    y = 4; // OK 
    var b = 5;  // NE
```

skor vedno hocte === names ==, ker == ti ful stvari pretvor v string pa take tkoda probite skos ===, !== ...

ne pozabt na ; ni ga treba dajat sam je velik leps

pr loopanje `for (const entity in scene)` pa `for (const entity of scene)` ni isto
en ti loopa cez klice (za array so to 1 2 3 4) en pa cez vrednosti (player, enemy1, enemy2), vecino casa hoces for ...of

v kodo loh napises debugger in se ti bo v F12 v browserju koda pavzala tm in loh pol pises shit v konzolo

``` js
debugger;
```

ce ti mece cudne errorje da ne najde kniznce prever a ma import .js nakonc
```js
import { Entity, Transform, Model } from '../core/core.js';
```