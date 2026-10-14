---
title: Notifications
description: Rules you configure in Hauser, automations Home Assistant runs.
sidebar:
  order: 11
---

Hauser is the configurator and the display. Home Assistant does the waiting and the triggering. That way a rule keeps working when every Hauser screen is off.

## Categories

**Settings → Home → Notifications** has eight categories you fill yourself:

Laundry, Doors & windows, Motion & presence, Safety, Climate, Device health, Energy, Custom.

Each category has a colour for the border of its tiles.

## A rule

A rule names an entity, the states that trigger it, a delay before it counts and, where it fits, a threshold to stay above or below. Each enabled trigger becomes a Home Assistant automation. Hauser keeps that set in step when you save and updates installed blueprints when the server starts after an update.

Rule notifications use the entity's current Home Assistant display name. Condition notifications disappear when none of that rule's enabled triggers still match, for example when CO₂ returns to the normal range or a window closes. Unknown or unavailable readings do not count as confirmation that a problem is resolved. A finished-laundry task stays until you dismiss it.

- **Test send** shows what a rule will look like.
- **History** comes from the Home Assistant logbook.

## Laundry

**Settings → Home → Notifications → Laundry** is a guided setup for the washer and the dryer. Two paths:

- bind an existing status entity, or
- use the bundled **power-sensor blueprint**: choose the sensor, review thresholds and hold times, preview the exact Home Assistant objects, then confirm.

Cycle detection stays in Home Assistant.

## How notifications appear

On the room screen, the panel lists notifications in a scrollable sidebar on
the right. It follows the control panel's automatic-hide setting and delay;
a touch brings it back. The notification count remains visible while the
sidebar is hidden.

On the phone in the browser, the first two tiles flow with the content. Tap
**Notifications**, including the **+N** count, to read every active message
in full. Opening a message does not dismiss it. The same list is available
from notification settings.

The native iPhone and iPad app has a notifications list for both Home
Assistant and Apple Home. With Home Assistant, it also receives `hauser_`
persistent notifications and dismisses them in their HA source, so connected
screens follow the change. With Apple Home, it shows the states, doorbell
events and due reminders observed by the app; completing a reminder writes
to its configured source. An open window remains visible until it closes.
The `hauser://open?screen=notifications` link opens this list in the native app.

## Send your own notification

You do not need a rule for everything. Any automation in Home Assistant can put a tile on the panel: create a persistent notification whose `notification_id` starts with `hauser_`. Hauser mirrors exactly these, with the title and message you give it, and dismissing the tile removes the notification in Home Assistant again. The same id replaces the previous tile, so a recurring reminder does not pile up.

```yaml
actions:
  - action: persistent_notification.create
    data:
      notification_id: hauser_muell
      title: Bins tomorrow
      message: Paper and packaging go out tonight.
```

Use it for what only your home knows: the mailbox sensor, the bin calendar, a leak detector, an awning still open in the evening. The panel, phone browser and native iOS app receive these notifications while connected to Home Assistant.

For a notification sent by your own automation, that automation also decides
when its task is done. When the mailbox is emptied or the bins are taken out,
dismiss it using the same id:

```yaml
actions:
  - action: persistent_notification.dismiss
    data:
      notification_id: hauser_muell
```

Hauser rules linked to a sensor clear their own condition notifications.
Hauser cannot infer whether a free-form reminder has been completed.

## Caller display

If Home Assistant has a call-monitor integration, use its incoming-call state
and caller attributes in an automation. For example, with the FRITZ!Box Call
Monitor, replace **every** occurrence of `sensor.phone` below with your
call-monitor sensor:

```yaml
alias: Caller on Hauser
triggers:
  - trigger: state
    entity_id: sensor.phone
    to: ringing
actions:
  - action: persistent_notification.create
    data:
      notification_id: hauser_call
      title: Telephone
      message: >-
        {{ state_attr('sensor.phone', 'from_name')
           or state_attr('sensor.phone', 'from')
           or 'Unknown caller' }} is calling.
```

The same notification id replaces the previous caller. The message remains
until dismissed; this is a last-caller display, not a complete call log or
an indication that a call was missed. Phone-book names depend on the call
monitor's configuration in Home Assistant.

## Not yet

A shared notification history, quiet hours, browser push and Apple Home
history synchronisation are later work. Suspended native apps do not record
an uninterrupted HomeKit event history.
