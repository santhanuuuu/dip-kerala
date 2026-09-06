"""
helplines.py

IMPORTANT SAFETY NOTE -- read before editing this file:
There is no public, live-updating API for Kerala district-level emergency contact numbers
or real-time shelter occupancy. Fabricating specific phone numbers here would be actively
dangerous -- a wrong number in a real emergency is a genuine safety risk, not just a data
quality issue. This file only includes numbers that are verifiably correct (national
emergency numbers, and the one State Emergency Operations Centre number that appeared
verbatim in the KSDMA Memorandum PDF used earlier in this project). Every district-specific
control room number below is marked as a placeholder that a real person must verify and
fill in -- do NOT invent plausible-looking numbers to fill these gaps.
"""

# Confirmed real -- India's standard national emergency numbers, unified under 112 since 2019.
NATIONAL_EMERGENCY_CONTACTS = [
    {"contact_type": "emergency", "name": "National Emergency Number", "phone_number": "112"},
    {"contact_type": "police", "name": "Police", "phone_number": "100"},
    {"contact_type": "fire", "name": "Fire and Rescue Services", "phone_number": "101"},
    {"contact_type": "ambulance", "name": "Ambulance", "phone_number": "108"},
    {"contact_type": "disaster_management", "name": "Disaster Management Helpline", "phone_number": "1077"},
]

# Confirmed real -- this exact number appears in the KSDMA "Additional Memorandum: Kerala
# Floods 2018" document used to build this project's ground-truth labels.
STATE_EMERGENCY_OPERATIONS_CENTRE = {
    "district": "Kerala (State-wide)",
    "contact_type": "control_room",
    "name": "Kerala State Emergency Operations Centre (SEOC), Thiruvananthapuram",
    "phone_number": "0471-2364424",
}

# PLACEHOLDER -- every district needs its own collectorate/district disaster management
# control room number verified and added here. DO NOT fill these with guessed numbers.
# Source these from each district collectorate's official website or by calling KSDMA
# directly to ask for the current list -- then replace "VERIFY_AND_ADD" below.
DISTRICT_CONTROL_ROOMS_TEMPLATE = [
    {"district": d, "contact_type": "control_room", "name": f"{d} District Disaster Management Control Room", "phone_number": "VERIFY_AND_ADD"}
    for d in [
        "Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam",
        "Idukki", "Ernakulam", "Thrissur", "Palakkad", "Malappuram",
        "Kozhikode", "Wayanad", "Kannur", "Kasaragod",
    ]
]


def get_seed_contacts():
    """Returns everything known-safe to seed automatically. District control room numbers
    are intentionally NOT included here until verified -- see seed_helplines.py output for
    exactly which rows need manual completion before this feature is presented as reliable."""
    return NATIONAL_EMERGENCY_CONTACTS + [STATE_EMERGENCY_OPERATIONS_CENTRE]


# --- Shelters ---
# There is no public API for Kerala relief-shelter locations or live occupancy. The
# `shelters` table (see db/models.py) exists so the app CAN show this once real data is
# available, but "update every day automatically" is not honestly achievable without either:
#   (a) a real government/NGO data feed for shelter status (doesn't publicly exist today), or
#   (b) a manual daily entry process by an admin/authority user through an admin panel
# Recommendation: build a simple admin-only form (POST /api/admin/shelters) where a
# disaster-management authority updates shelter status manually once a day during an active
# event, rather than presenting this as automated when it isn't. This is the honest version
# of the feature, not a lesser one -- it's what real disaster-management apps typically do
# for exactly this kind of data.
