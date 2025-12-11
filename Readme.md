# Yakuza tower

dober dan :D
a
SHALOM

# Game design:

***Particle effects:*** Sandevistan, blood, weapon effects.

***Animations:*** Make it look pretty

***Environment:*** Door opening, wall barriers, picking up weapons

***Camera:*** First person player and third person replay.

***Enemies:*** Pathfinding, possible boss fight.

## Levels:
- **Level 1:** starter level, tutorial level.

You start in front of the tower, empty handed, just to see how it looks.
Then you go through the door where one opponent waits with his back turned.

***Melee mechanic introduction*** You punch the dude and he drops a katana.

Follows: ***Picking up mechanic introduction*** 
You get introduced to picking up things, recieve your first weapon.

A prompt tells you to open the door then slice the opponents walking towards you with katanas.
You need to kill them, if! you die.

After, you go through another door, a narrow hallway awaits where a gunman stands, forcing you to stop time.
Popup that tells you what to press. When you kill him you can go up the stairs that spawn you in level 2.

- **Level 2:** Later

## Mechanics

Jumping, crouching.

### Sandevistan
Limited bar - for example 10 seconds. Minimum usage of bar is 2~ seconds. Cooldown of 1~ second.

Time stops aka slows, you can move normally.

### Health
One shot and you die. If you touch a bullet when time is slowed you also die.
The bullets resume their trajectory normally, making it possible to get hit by it even when all enemies in the room are dead.

## Weapons
Katana, gun. We can implement that you can shoot yourself accidentally.


## Extras
**Sandevistan:** CCTV cameras in rooms, replay at the end of a level, David style.
**Katana:** Right click to throw.
**Leaderboard:** With names

# Implementing

* Text
* Audio
* *Start menu

### Player controller
* classic movement, jump, crouch. 
* mouse moving, controls
* sandevistan
* Picking up

### Weapons
* katana
* gun
* unarmed

### Assets
* *Levels
* Enemies
* Player
* Weapons
* Background, floor
* Tower

### Animations
* Player: walking, aiming, shooting, swinging
* Enemies: walking, aiming, shooting, swinging
* Sandevistan
* *Replay
* Door
* Level transition (Elevator)
* Weapon shooting, swinging

### Enemies
* Shooting, swinging
* Movement
* Pathfinding
* *Line of sight

### Graphics
* Lighting sistem
* Shadows

## Roles
Somehow in order of doing.

### Nika
**Enemies**
* Collisions
* Line of sight
* Movement
* Pathfinding

**Animations**
* Sandevistan
* Weapon shooting, swinging
* Player: walking, aiming, shooting, swinging
* Enemies: walking, aiming, shooting, swinging

**Assets**
* Player
* Weapons
* Background, floor
* Enemy 2

### Jan
**Graphics**
* Lighting sistem
* Shadows

**Animations**
* Enabling animations
* Door (Opening)

**Assets**
* Door
* Tower
* Enemy 2

### Aleks
**Player Controller**
* classic movement, jump, crouch. 
* mouse moving, controls
* Picking up
* Dropping
* sandevistan

**Animations**
* Level Transition (Elevator)

**Assets**
* Elevator
* Enemy 3

### Illia
**Enemies**
* Shooting
* Swinging

**Weapons**
* unarmed
* katana
* gun